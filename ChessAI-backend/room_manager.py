import uuid
import random
import string
import time
from typing import Optional
from fastapi import WebSocket


class GameRoom:
    def __init__(self, room_id: str, room_code: str, time_minutes: int, increment: int, creator_color: str = "white"):
        self.room_id = room_id
        self.room_code = room_code
        self.time_minutes = time_minutes
        self.increment = increment
        self.status = "waiting"  # waiting, playing, checkmate, stalemate, timeout, forfeit, aborted

        # Color assignment
        # creator_color can be "white", "black", or "random"
        if creator_color == "random":
            self.creator_color = random.choice(["white", "black"])
        else:
            self.creator_color = creator_color
        self.joiner_color = "black" if self.creator_color == "white" else "white"

        # Board state
        self.board = self._create_initial_board()
        self.turn = "white"
        self.last_move = None
        self.last_move_notation = None
        self.castling_rights = {
            "white_kingside": True,
            "white_queenside": True,
            "black_kingside": True,
            "black_queenside": True,
        }
        self.captured_by_white: list = []
        self.captured_by_black: list = []

        # Timer state
        self.white_time = time_minutes * 60
        self.black_time = time_minutes * 60

        # Players: maps WebSocket -> color
        self.players: dict[WebSocket, str] = {}
        self.creator_ws: Optional[WebSocket] = None

        # Inactivity tracking
        self.last_activity_time: float = time.time()
        self.created_at: float = time.time()
        # Inactivity timeout: base of 2 minutes per side-minute, clamped between 60s and 600s
        # e.g., 1 min game -> 120s, 3 min -> 360s capped at 600s, 10 min -> 600s
        raw_timeout = time_minutes * 30
        self.inactivity_timeout: float = max(30.0, min(raw_timeout, 180.0))
        # Waiting timeout: how long to wait for opponent before auto-abort (5 minutes)
        self.waiting_timeout: float = 300.0

    def _create_initial_board(self):
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

    def touch_activity(self):
        """Update last activity timestamp."""
        self.last_activity_time = time.time()

    def is_inactive(self) -> bool:
        """Check if the game has been inactive too long."""
        if self.status not in ("playing", "check"):
            return False
        return (time.time() - self.last_activity_time) > self.inactivity_timeout

    def is_waiting_too_long(self) -> bool:
        """Check if room has been waiting for opponent too long."""
        if self.status != "waiting":
            return False
        return (time.time() - self.created_at) > self.waiting_timeout

    def get_inactivity_remaining(self) -> float:
        """Seconds remaining before inactivity abort."""
        elapsed = time.time() - self.last_activity_time
        return max(0.0, self.inactivity_timeout - elapsed)

    def is_full(self) -> bool:
        return len(self.players) >= 2

    def get_player_color(self, ws: WebSocket) -> Optional[str]:
        return self.players.get(ws)

    async def send_to(self, ws: WebSocket, data: dict):
        try:
            await ws.send_json(data)
        except Exception:
            pass

    async def broadcast(self, data: dict):
        for ws in list(self.players.keys()):
            await self.send_to(ws, data)

    async def broadcast_except(self, exclude_ws: WebSocket, data: dict):
        for ws in list(self.players.keys()):
            if ws != exclude_ws:
                await self.send_to(ws, data)


class RoomManager:
    def __init__(self):
        self.rooms: dict[str, GameRoom] = {}
        self.code_to_room: dict[str, str] = {}

    def _generate_code(self, length=6) -> str:
        while True:
            code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))
            if code not in self.code_to_room:
                return code

    def create_room(self, minutes: int, increment: int, creator_color: str = "white") -> tuple[str, str]:
        room_id = str(uuid.uuid4())
        room_code = self._generate_code()
        room = GameRoom(room_id, room_code, minutes, increment, creator_color)
        self.rooms[room_id] = room
        self.code_to_room[room_code] = room_id
        return room_id, room_code

    def get_room(self, room_id: str) -> Optional[GameRoom]:
        return self.rooms.get(room_id)

    def get_room_by_code(self, code: str) -> Optional[GameRoom]:
        room_id = self.code_to_room.get(code.upper())
        if room_id:
            return self.rooms.get(room_id)
        return None

    async def add_player(self, room_id: str, ws: WebSocket) -> Optional[str]:
        room = self.rooms.get(room_id)
        if not room or room.is_full():
            return None

        if not room.players:
            # First player = creator
            color = room.creator_color
            room.creator_ws = ws
        else:
            # Second player = joiner
            color = room.joiner_color

        room.players[ws] = color
        room.touch_activity()
        return color

    async def remove_player(self, room_id: str, ws: WebSocket):
        room = self.rooms.get(room_id)
        if room and ws in room.players:
            disconnected_color = room.players[ws]
            del room.players[ws]

            if room.status in ("playing", "check", "waiting"):
                room.status = "aborted"
                winner = "black" if disconnected_color == "white" else "white"
                await room.broadcast({
                    "type": "game_over",
                    "reason": "disconnect",
                    "winner": winner,
                    "message": f"{disconnected_color.capitalize()} disconnected. {winner.capitalize()} wins!",
                })

    def cleanup_room(self, room_id: str):
        room = self.rooms.get(room_id)
        if room:
            if room.room_code in self.code_to_room:
                del self.code_to_room[room.room_code]
            del self.rooms[room_id]

    def get_inactive_rooms(self) -> list[str]:
        """Return room_ids of rooms that should be aborted due to inactivity or waiting too long."""
        inactive = []
        for room_id, room in self.rooms.items():
            if room.is_inactive() or room.is_waiting_too_long():
                inactive.append(room_id)
        return inactive

    def get_finished_rooms(self) -> list[str]:
        """Return room_ids that are finished and have no players connected."""
        finished = []
        for room_id, room in self.rooms.items():
            if room.status in ("checkmate", "stalemate", "timeout", "forfeit", "aborted") and len(room.players) == 0:
                finished.append(room_id)
        return finished


room_manager = RoomManager()