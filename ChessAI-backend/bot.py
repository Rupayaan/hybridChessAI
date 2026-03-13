from typing import Tuple, Optional
from rules import filter_legal_moves
from moves import get_piece_color
import random

def bot_move(board, color: str, last_move=None, castling_rights=None) -> Optional[Tuple[int, int, int, int]]:
    all_moves = []
    for row in range(8):
        for col in range(8):
            piece = board[row][col]
            if piece and get_piece_color(piece) == color:
                legal_moves = filter_legal_moves(board, row, col, color, last_move, castling_rights)
                for move in legal_moves:
                    all_moves.append((row, col, move[0], move[1]))

    if not all_moves:
        return None

    # Simple bot: pick a random legal move instead of always the first
    return random.choice(all_moves)