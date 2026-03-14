"""
Hybrid Chess AI
- Combines classical engine evaluation with neural network evaluation
- Uses configurable weights to blend both approaches
- The neural network learns patterns the classical engine misses
- The classical engine provides reliable tactical calculation
"""

from engine import (
    engine_best_move, evaluate_board, get_all_moves,
    make_move_copy, order_moves, is_endgame,
    quiescence_search, PIECE_VALUES
)
from neural_eval import neural_evaluator
from rules import is_king_in_check, filter_legal_moves
from moves import get_piece_color


# ---- Hybrid Evaluation ----
def hybrid_evaluate(board, engine_weight=0.6, neural_weight=0.4):
    """
    Combine classical and neural evaluation.

    engine_weight: how much to trust the classical engine (0-1)
    neural_weight: how much to trust the neural network (0-1)

    If the neural network is untrained, fall back to pure classical.
    """
    classical_score = evaluate_board(board)

    if not neural_evaluator.trained:
        return classical_score

    neural_score = neural_evaluator.evaluate(board)

    return engine_weight * classical_score + neural_weight * neural_score


# ---- Hybrid Minimax ----
def hybrid_minimax(board, depth, alpha, beta, maximizing, color,
                   last_move, castling_rights, engine_weight=0.6, neural_weight=0.4):
    """
    Minimax using hybrid evaluation at leaf nodes.
    """
    if depth == 0:
        # Quiescence-like: evaluate with hybrid function
        score = hybrid_evaluate(board, engine_weight, neural_weight)
        if color == "black":
            score = -score
        return score, None

    moves = get_all_moves(board, color, last_move, castling_rights)

    if not moves:
        if is_king_in_check(board, color):
            return (-99999 if maximizing else 99999), None
        return 0, None

    moves = order_moves(board, moves)
    opponent = "black" if color == "white" else "white"
    best_move = moves[0]

    if maximizing:
        max_eval = float("-inf")
        for move in moves:
            from_row, from_col, to_row, to_col = move
            new_board = make_move_copy(board, from_row, from_col, to_row, to_col)
            new_last_move = (from_row, from_col, to_row, to_col)

            eval_score, _ = hybrid_minimax(
                new_board, depth - 1, alpha, beta, False,
                opponent, new_last_move, castling_rights,
                engine_weight, neural_weight
            )
            if eval_score > max_eval:
                max_eval = eval_score
                best_move = move
            alpha = max(alpha, eval_score)
            if beta <= alpha:
                break
        return max_eval, best_move
    else:
        min_eval = float("inf")
        for move in moves:
            from_row, from_col, to_row, to_col = move
            new_board = make_move_copy(board, from_row, from_col, to_row, to_col)
            new_last_move = (from_row, from_col, to_row, to_col)

            eval_score, _ = hybrid_minimax(
                new_board, depth - 1, alpha, beta, True,
                opponent, new_last_move, castling_rights,
                engine_weight, neural_weight
            )
            if eval_score < min_eval:
                min_eval = eval_score
                best_move = move
            beta = min(beta, eval_score)
            if beta <= alpha:
                break
        return min_eval, best_move


# ---- Main Entry Point ----
def hybrid_best_move(board, color, last_move, castling_rights, depth=3):
    """
    Get the best move using the hybrid AI.

    The hybrid approach:
    1. Uses minimax with alpha-beta pruning for tree search
    2. At leaf nodes, combines classical + neural evaluation
    3. Move ordering uses classical eval for speed
    4. Depth adapts based on game phase
    """
    # Adjust depth based on game phase
    if is_endgame(board):
        depth = min(depth + 1, 5)  # Search deeper in endgame

    # Count pieces for adaptive weights
    total_pieces = sum(1 for r in board for p in r if p)

    # In endgame, trust classical engine more (tactics matter more)
    # In middlegame, trust neural network more (patterns matter more)
    if total_pieces <= 10:
        engine_weight = 0.8
        neural_weight = 0.2
    elif total_pieces <= 20:
        engine_weight = 0.6
        neural_weight = 0.4
    else:
        engine_weight = 0.5
        neural_weight = 0.5

    maximizing = (color == "white")
    score, best_move = hybrid_minimax(
        board, depth, float("-inf"), float("inf"),
        maximizing, color, last_move, castling_rights,
        engine_weight, neural_weight
    )

    return best_move, score