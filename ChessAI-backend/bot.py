"""
Bot move selection — uses the Hybrid AI (classical + neural network).
Falls back to classical engine if neural weights aren't available.
"""

from hybrid_ai import hybrid_best_move
from engine import engine_best_move


def bot_move(board, color, last_move, castling_rights):
    """
    Get the best move for the bot using the hybrid AI.
    Returns (from_row, from_col, to_row, to_col) or None.
    """
    try:
        move, score = hybrid_best_move(board, color, last_move, castling_rights, depth=3)
        if move:
            return move
    except Exception as e:
        print(f"Hybrid AI error: {e}, falling back to classical engine")

    # Fallback to pure classical engine
    try:
        move, score = engine_best_move(board, color, last_move, castling_rights, depth=3)
        return move
    except Exception as e:
        print(f"Classical engine error: {e}")
        return None