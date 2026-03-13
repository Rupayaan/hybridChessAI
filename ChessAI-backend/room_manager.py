import uuid
import copy
from typing import Dict, Optional
from fastapi import WebSocket

class GameRoom:
    """Represents a single online game between two players."""

    def __init__(self, room_id: str, time_minutes: int, increment: int):
        self.room_id = room_id
        self.time_minutes = time_minutes
        self.increment = increment

        # Players
        self.white_ws: Optional[WebSocket] = None
        self.black_ws: Optional[WebSocket] = None

        # Game state
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
        self.captured_by_white = []
        self.captured_by_black = []
        self.white_time = time_minutes * 60
        self.black_time = time_minutes * 60
        self.status = "waiting"  # waiting | playing | checkmate | stalemate | forfeit

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

    def is_full(self) -> bool:
        return self.white_ws is not None and self.black_ws is not None

    def get_player_color(self, ws: WebSocket) -> Optional[str]:
        if ws == self.white_ws:
            return "white"
        elif ws == self.black_ws:
            return "black"
        return None

    async def broadcast(self, message: dict):
        """Send a message to both players."""
        import json
        msg = json.dumps(message)
        if self.white_ws:
            try:
                await self.white_ws.send_text(msg)
            except Exception:
                pass
        if self.black_ws:
            try:
                await self.black_ws.send_text(msg)
            except Exception:
                pass

    async def send_to(self, ws: WebSocket, message: dict):
        """Send a message to a specific player."""
        import json
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            pass


class RoomManager:
    """
    Manages all active game rooms.

    Flow:
    1. Player A calls /api/create-room → gets room_id
    2. Player A connects via WebSocket with room_id → assigned white
    3. Player B calls /api/join-room with room_id
    4. Player B connects via WebSocket with room_id → assigned black
    5. Game starts, moves are exchanged via WebSocket
    """

    def __init__(self):
        self.rooms: Dict[str, GameRoom] = {}
        # Maps room codes (short, human-friendly) to room IDs
        self.room_codes: Dict[str, str] = {}

    def create_room(self, time_minutes: int, increment: int) -> tuple[str, str]:
        """Create a new room. Returns (room_id, room_code)."""
        room_id = str(uuid.uuid4())
        # Generate a short 6-character code for easy sharing
        room_code = uuid.uuid4().hex[:6].upper()

        room = GameRoom(room_id, time_minutes, increment)
        self.rooms[room_id] = room
        self.room_codes[room_code] = room_id

        return room_id, room_code

    def get_room_by_code(self, code: str) -> Optional[GameRoom]:
        room_id = self.room_codes.get(code.upper())
        if room_id:
            return self.rooms.get(room_id)
        return None

    def get_room(self, room_id: str) -> Optional[GameRoom]:
        return self.rooms.get(room_id)

    def remove_room(self, room_id: str):
        room = self.rooms.pop(room_id, None)
        if room:
            # Remove the code mapping too
            codes_to_remove = [
                code for code, rid in self.room_codes.items() if rid == room_id
            ]
            for code in codes_to_remove:
                del self.room_codes[code]

    async def add_player(self, room_id: str, ws: WebSocket) -> Optional[str]:
        """Add a player to a room. Returns their color or None if room full."""
        room = self.rooms.get(room_id)
        if not room:
            return None

        if room.white_ws is None:
            room.white_ws = ws
            return "white"
        elif room.black_ws is None:
            room.black_ws = ws
            room.status = "playing"
            return "black"

        return None  # Room is full

    async def remove_player(self, room_id: str, ws: WebSocket):
        """Remove a player from a room (disconnect/forfeit)."""
        room = self.rooms.get(room_id)
        if not room:
            return

        color = room.get_player_color(ws)
        if color == "white":
            room.white_ws = None
        elif color == "black":
            room.black_ws = None

        # If game was in progress, the remaining player wins
        if room.status == "playing":
            room.status = "forfeit"
            winner = "black" if color == "white" else "white"
            await room.broadcast({
                "type": "game_over",
                "reason": "forfeit",
                "winner": winner,
                "message": f"{color.capitalize()} disconnected. {winner.capitalize()} wins!",
            })

        # If both players are gone, clean up the room
        if room.white_ws is None and room.black_ws is None:
            self.remove_room(room_id)


# Global singleton
room_manager = RoomManager()