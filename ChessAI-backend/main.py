from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List
from room_manager import room_manager, GameRoom
from moves import get_piece_color
from rules import filter_legal_moves, is_king_in_check, is_pawn_promotion, is_en_passant, is_castling
from bot import bot_move
from contextlib import asynccontextmanager
import asyncio
import json
import os

# ---- Background task: inactivity checker ----
async def inactivity_checker():
    """Periodically check for inactive/stale rooms and abort them."""
    while True:
        await asyncio.sleep(15)  # Check every 15 seconds
        try:
            # Abort inactive game rooms
            inactive_ids = room_manager.get_inactive_rooms()
            for room_id in inactive_ids:
                room = room_manager.get_room(room_id)
                if room:
                    if room.status == "waiting":
                        room.status = "aborted"
                        await room.broadcast({
                            "type": "game_over",
                            "reason": "abort",
                            "winner": None,
                            "message": "Room closed — no opponent joined in time.",
                        })
                    elif room.status in ("playing", "check"):
                        # The player whose turn it is gets aborted
                        inactive_color = room.turn
                        winner = "black" if inactive_color == "white" else "white"
                        room.status = "aborted"
                        await room.broadcast({
                            "type": "game_over",
                            "reason": "inactivity",
                            "winner": winner,
                            "message": f"{inactive_color.capitalize()} ran out of activity time. {winner.capitalize()} wins!",
                            "board": board_to_frontend(room.board),
                            "capturedByWhite": captured_to_frontend(room.captured_by_white),
                            "capturedByBlack": captured_to_frontend(room.captured_by_black),
                        })

            # Cleanup finished rooms with no players
            finished_ids = room_manager.get_finished_rooms()
            for room_id in finished_ids:
                room_manager.cleanup_room(room_id)

        except Exception as e:
            print(f"Inactivity checker error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    task = asyncio.create_task(inactivity_checker())
    yield
    # Shutdown
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(lifespan=lifespan)

# CORS
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
FRONTEND_URL = os.environ.get("FRONTEND_URL", "")
if FRONTEND_URL:
    ALLOWED_ORIGINS.append(FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Game State (for bot/local modes only) ----
def create_initial_board():
    return [
        ["r", "n", "b", "q", "k", "b", "n", "r"],
        ["p", "p", "p", "p", "p", "p", "p", "p"],
        [None, None, None, None, None, None, None, None],
        [None, None, None, None, None, None, None, None],
        [None, None, None, None, None, None, None, None],
        [None, None, None, None, None, None, None, None],
        ["P", "P", "P", "P", "P", "P", "P", "P"],
        ["R", "N", "B", "Q", "K", "B", "N", "R"],
    ]

board = create_initial_board()
turn = "white"
last_move = None
last_move_notation = None
castling_rights = {
    "white_kingside": True,
    "white_queenside": True,
    "black_kingside": True,
    "black_queenside": True,
}
captured_by_white: List[str] = []
captured_by_black: List[str] = []

FILES = ["a", "b", "c", "d", "e", "f", "g", "h"]

# ---- Request Models ----
class CreateRoomRequest(BaseModel):
    minutes: int
    increment: int
    color: str = "white"  # "white", "black", or "random"

class JoinRoomRequest(BaseModel):
    room_code: str

class PositionRequest(BaseModel):
    row: int
    col: int

class RoomPositionRequest(BaseModel):
    room_id: str
    row: int
    col: int

class MoveRequest(BaseModel):
    from_row: int
    from_col: int
    to_row: int
    to_col: int
    promotion: Optional[str] = None

# ---- Helper: Convert board to frontend format ----
PIECE_MAP = {
    "P": {"sprite": "/assets/pawn.png", "type": "pawn", "color": "white"},
    "R": {"sprite": "/assets/rook.png", "type": "rook", "color": "white"},
    "N": {"sprite": "/assets/knight.png", "type": "knight", "color": "white"},
    "B": {"sprite": "/assets/bishop.png", "type": "bishop", "color": "white"},
    "Q": {"sprite": "/assets/queen.png", "type": "queen", "color": "white"},
    "K": {"sprite": "/assets/king.png", "type": "king", "color": "white"},
    "p": {"sprite": "/assets/pawn1.png", "type": "pawn", "color": "black"},
    "r": {"sprite": "/assets/rook1.png", "type": "rook", "color": "black"},
    "n": {"sprite": "/assets/knight1.png", "type": "knight", "color": "black"},
    "b": {"sprite": "/assets/bishop1.png", "type": "bishop", "color": "black"},
    "q": {"sprite": "/assets/queen1.png", "type": "queen", "color": "black"},
    "k": {"sprite": "/assets/king1.png", "type": "king", "color": "black"},
}

PIECE_NOTATION = {
    "k": "K", "q": "Q", "r": "R", "b": "B", "n": "N", "p": ""
}

def board_to_frontend(b):
    result = []
    for row in b:
        frontend_row = []
        for cell in row:
            if cell and cell in PIECE_MAP:
                frontend_row.append(PIECE_MAP[cell])
            else:
                frontend_row.append(None)
        result.append(frontend_row)
    return result

def captured_to_frontend(captured_list):
    result = []
    for c in captured_list:
        if c in PIECE_MAP:
            result.append(PIECE_MAP[c])
    return result

def to_algebraic(from_row, from_col, to_row, to_col, piece, captured,
                 is_ep=False, is_castle=False, promotion=None,
                 board_state=None, color=None,
                 ctx_last_move=None, ctx_castling_rights=None):
    if is_castle:
        if to_col == 6:
            return "O-O"
        else:
            return "O-O-O"

    dest = FILES[to_col] + str(8 - to_row)
    p = piece.lower()

    if p == "p":
        if captured or is_ep:
            notation = FILES[from_col] + "x" + dest
        else:
            notation = dest
        if promotion:
            notation += "=" + promotion.upper()
    else:
        prefix = PIECE_NOTATION.get(p, "")
        cap = "x" if captured or is_ep else ""
        notation = prefix + cap + dest

    if board_state and color:
        opponent = "black" if color == "white" else "white"
        lm = ctx_last_move
        cr = ctx_castling_rights
        if is_king_in_check(board_state, opponent):
            has_moves = False
            for r in range(8):
                for c in range(8):
                    pc = board_state[r][c]
                    if pc and get_piece_color(pc) == opponent:
                        moves = filter_legal_moves(board_state, r, c, opponent, lm, cr)
                        if moves:
                            has_moves = True
                            break
                if has_moves:
                    break
            if not has_moves:
                notation += "#"
            else:
                notation += "+"

    return notation

def check_game_status_ctx(b, color, ctx_last_move, ctx_castling_rights):
    in_check = is_king_in_check(b, color)
    has_legal_moves = False

    for row in range(8):
        for col in range(8):
            piece = b[row][col]
            if piece and get_piece_color(piece) == color:
                moves = filter_legal_moves(b, row, col, color, ctx_last_move, ctx_castling_rights)
                if moves:
                    has_legal_moves = True
                    break
        if has_legal_moves:
            break

    if not has_legal_moves:
        if in_check:
            return "checkmate"
        return "stalemate"
    if in_check:
        return "check"
    return "playing"

def update_castling_rights_on(rights, piece, from_row, from_col, color):
    if piece.lower() == "k":
        if color == "white":
            rights["white_kingside"] = False
            rights["white_queenside"] = False
        else:
            rights["black_kingside"] = False
            rights["black_queenside"] = False
    elif piece.lower() == "r":
        if from_row == 7 and from_col == 0:
            rights["white_queenside"] = False
        elif from_row == 7 and from_col == 7:
            rights["white_kingside"] = False
        elif from_row == 0 and from_col == 0:
            rights["black_queenside"] = False
        elif from_row == 0 and from_col == 7:
            rights["black_kingside"] = False

def update_castling_rights_on_capture(rights, captured, to_row, to_col):
    if captured and captured.lower() == "r":
        if to_row == 7 and to_col == 7:
            rights["white_kingside"] = False
        elif to_row == 7 and to_col == 0:
            rights["white_queenside"] = False
        elif to_row == 0 and to_col == 7:
            rights["black_kingside"] = False
        elif to_row == 0 and to_col == 0:
            rights["black_queenside"] = False

def execute_move_on_board(b, from_row, from_col, to_row, to_col,
                          color, ctx_last_move, ctx_castling_rights,
                          ctx_captured_white, ctx_captured_black,
                          promotion=None):
    piece = b[from_row][from_col]
    captured = b[to_row][to_col]
    is_ep = is_en_passant(b, from_row, from_col, to_row, to_col, ctx_last_move)
    is_castle = is_castling(b, from_row, from_col, to_row, to_col, color, ctx_castling_rights)

    ep_captured = None
    if is_ep:
        ep_captured = b[from_row][to_col]
        b[from_row][to_col] = None

    if is_castle:
        if to_col == 6:
            b[from_row][5] = b[from_row][7]
            b[from_row][7] = None
        elif to_col == 2:
            b[from_row][3] = b[from_row][0]
            b[from_row][0] = None

    update_castling_rights_on(ctx_castling_rights, piece, from_row, from_col, color)
    update_castling_rights_on_capture(ctx_castling_rights, captured, to_row, to_col)

    actual_captured = captured if captured else ep_captured
    if actual_captured:
        if color == "white":
            ctx_captured_white.append(actual_captured)
        else:
            ctx_captured_black.append(actual_captured)

    if is_pawn_promotion(b, from_row, to_row, piece):
        promo = promotion if promotion else "q"
        b[to_row][to_col] = promo.upper() if color == "white" else promo.lower()
    else:
        b[to_row][to_col] = piece

    b[from_row][from_col] = None
    new_last_move = (from_row, from_col, to_row, to_col)

    notation = to_algebraic(
        from_row, from_col, to_row, to_col, piece,
        actual_captured, is_ep, is_castle, promotion,
        b, color,
        ctx_last_move=new_last_move,
        ctx_castling_rights=ctx_castling_rights,
    )

    return notation, new_last_move

# ---- Global execute_move wrapper (for bot/local) ----
def execute_move(from_row, from_col, to_row, to_col, promotion=None):
    global turn, last_move, last_move_notation

    color = turn
    notation, new_last_move = execute_move_on_board(
        board, from_row, from_col, to_row, to_col,
        color, last_move, castling_rights,
        captured_by_white, captured_by_black,
        promotion
    )
    last_move = new_last_move
    last_move_notation = notation
    turn = "black" if turn == "white" else "white"

def build_response():
    status = check_game_status_ctx(board, turn, last_move, castling_rights)
    return {
        "board": board_to_frontend(board),
        "turn": turn,
        "status": status,
        "lastMove": last_move_notation,
        "capturedByWhite": captured_to_frontend(captured_by_white),
        "capturedByBlack": captured_to_frontend(captured_by_black),
    }

# ---- API Endpoints (bot/local) ----

@app.post("/api/reset")
def reset_board():
    global board, turn, last_move, last_move_notation, castling_rights, captured_by_white, captured_by_black
    board = create_initial_board()
    turn = "white"
    last_move = None
    last_move_notation = None
    castling_rights = {
        "white_kingside": True,
        "white_queenside": True,
        "black_kingside": True,
        "black_queenside": True,
    }
    captured_by_white = []
    captured_by_black = []
    return {
        "status": "playing",
        "board": board_to_frontend(board),
        "turn": turn,
        "lastMove": None,
        "capturedByWhite": [],
        "capturedByBlack": [],
    }

@app.post("/api/legal-moves")
def get_legal_moves(req: PositionRequest):
    piece = board[req.row][req.col]
    if not piece or get_piece_color(piece) != turn:
        raise HTTPException(status_code=400, detail="Invalid piece selection")
    moves = filter_legal_moves(board, req.row, req.col, turn, last_move, castling_rights)
    return {"moves": moves}

@app.post("/api/move")
def make_move(req: MoveRequest):
    piece = board[req.from_row][req.from_col]
    if not piece or get_piece_color(piece) != turn:
        raise HTTPException(status_code=400, detail="Invalid piece selection")

    legal_moves = filter_legal_moves(board, req.from_row, req.from_col, turn, last_move, castling_rights)
    if (req.to_row, req.to_col) not in legal_moves:
        raise HTTPException(status_code=400, detail="Illegal move")

    execute_move(req.from_row, req.from_col, req.to_row, req.to_col, req.promotion)
    return build_response()

@app.post("/api/bot-move")
def bot_play():
    move = bot_move(board, turn, last_move, castling_rights)
    if not move:
        return build_response()

    from_row, from_col, to_row, to_col = move
    execute_move(from_row, from_col, to_row, to_col)
    response = build_response()
    response["increment"] = 0
    return response

# ---- Online Mode REST Endpoints ----

@app.post("/api/create-room")
def create_room(req: CreateRoomRequest):
    # Validate color choice
    color_choice = req.color.lower()
    if color_choice not in ("white", "black", "random"):
        color_choice = "white"

    room_id, room_code = room_manager.create_room(req.minutes, req.increment, color_choice)
    room = room_manager.get_room(room_id)
    return {
        "room_id": room_id,
        "room_code": room_code,
        "creator_color": room.creator_color,
        "message": f"Share code '{room_code}' with your opponent",
    }

@app.post("/api/join-room")
def join_room(req: JoinRoomRequest):
    room = room_manager.get_room_by_code(req.room_code)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room.is_full():
        raise HTTPException(status_code=400, detail="Room is full")
    return {
        "room_id": room.room_id,
        "room_code": req.room_code,
        "time_minutes": room.time_minutes,
        "increment": room.increment,
        "joiner_color": room.joiner_color,
    }

@app.post("/api/room/legal-moves")
def get_room_legal_moves(req: RoomPositionRequest):
    room = room_manager.get_room(req.room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    piece = room.board[req.row][req.col]
    if not piece or get_piece_color(piece) != room.turn:
        raise HTTPException(status_code=400, detail="Invalid piece selection")

    moves = filter_legal_moves(
        room.board, req.row, req.col, room.turn,
        room.last_move, room.castling_rights
    )
    return {"moves": moves}

# ---- WebSocket Endpoint ----

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await websocket.accept()

    room = room_manager.get_room(room_id)
    if not room:
        await websocket.send_json({"type": "error", "message": "Room not found"})
        await websocket.close()
        return

    color = await room_manager.add_player(room_id, websocket)
    if not color:
        await websocket.send_json({"type": "error", "message": "Room is full"})
        await websocket.close()
        return

    await room.send_to(websocket, {
        "type": "connected",
        "color": color,
        "board": board_to_frontend(room.board),
        "time_minutes": room.time_minutes,
        "increment": room.increment,
        "inactivity_timeout": room.inactivity_timeout,
    })

    if room.is_full():
        room.status = "playing"
        room.touch_activity()
        await room.broadcast({
            "type": "game_start",
            "board": board_to_frontend(room.board),
            "turn": room.turn,
            "white_time": room.white_time,
            "black_time": room.black_time,
            "inactivity_timeout": room.inactivity_timeout,
        })

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            msg_type = data.get("type")

            if msg_type == "move":
                await handle_online_move(room, websocket, data)

            elif msg_type == "forfeit":
                if room.status in ("playing", "check"):
                    room.status = "forfeit"
                    winner = "black" if color == "white" else "white"
                    await room.broadcast({
                        "type": "game_over",
                        "reason": "forfeit",
                        "winner": winner,
                        "message": f"{color.capitalize()} forfeited. {winner.capitalize()} wins!",
                        "board": board_to_frontend(room.board),
                        "capturedByWhite": captured_to_frontend(room.captured_by_white),
                        "capturedByBlack": captured_to_frontend(room.captured_by_black),
                    })

            elif msg_type == "time_update":
                room.white_time = data.get("white_time", room.white_time)
                room.black_time = data.get("black_time", room.black_time)

            elif msg_type == "timeout":
                if room.status in ("playing", "check"):
                    winner = data.get("winner", "unknown")
                    room.status = "timeout"
                    await room.broadcast({
                        "type": "game_over",
                        "reason": "timeout",
                        "winner": winner,
                        "message": f"Time out! {winner.capitalize()} wins!",
                        "board": board_to_frontend(room.board),
                        "capturedByWhite": captured_to_frontend(room.captured_by_white),
                        "capturedByBlack": captured_to_frontend(room.captured_by_black),
                    })

    except WebSocketDisconnect:
        await room_manager.remove_player(room_id, websocket)


async def handle_online_move(room: GameRoom, ws: WebSocket, data: dict):
    color = room.get_player_color(ws)

    if color != room.turn:
        await room.send_to(ws, {"type": "error", "message": "Not your turn"})
        return

    from_row = data["from_row"]
    from_col = data["from_col"]
    to_row = data["to_row"]
    to_col = data["to_col"]
    promotion = data.get("promotion")

    piece = room.board[from_row][from_col]
    if not piece or get_piece_color(piece) != room.turn:
        await room.send_to(ws, {"type": "error", "message": "Invalid piece"})
        return

    legal = filter_legal_moves(
        room.board, from_row, from_col, room.turn,
        room.last_move, room.castling_rights
    )
    if (to_row, to_col) not in legal:
        await room.send_to(ws, {"type": "error", "message": "Illegal move"})
        return

    # Touch activity on valid move
    room.touch_activity()

    notation, new_last_move = execute_move_on_board(
        room.board, from_row, from_col, to_row, to_col,
        color, room.last_move, room.castling_rights,
        room.captured_by_white, room.captured_by_black,
        promotion
    )
    room.last_move = new_last_move
    room.last_move_notation = notation
    room.turn = "black" if room.turn == "white" else "white"

    status = check_game_status_ctx(room.board, room.turn, room.last_move, room.castling_rights)

    response = {
        "type": "move_made",
        "board": board_to_frontend(room.board),
        "turn": room.turn,
        "status": status,
        "lastMove": notation,
        "capturedByWhite": captured_to_frontend(room.captured_by_white),
        "capturedByBlack": captured_to_frontend(room.captured_by_black),
        "increment": room.increment,
    }

    if status == "checkmate" or status == "stalemate":
        room.status = status
        winner = color if status == "checkmate" else None
        response["type"] = "game_over"
        response["reason"] = status
        response["winner"] = winner

    await room.broadcast(response)


# ---- Serve frontend static files in production ----
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    from fastapi.responses import FileResponse

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(STATIC_DIR, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))