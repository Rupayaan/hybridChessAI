"""
Classical Chess Engine
- Minimax with Alpha-Beta Pruning
- Piece-Square Tables for positional evaluation
- Move ordering for faster pruning
- Quiescence search to avoid horizon effect
"""

from moves import get_piece_color
from rules import filter_legal_moves, is_king_in_check

# ---- Material Values ----
PIECE_VALUES = {
    "p": 100, "n": 320, "b": 330, "r": 500, "q": 900, "k": 20000,
    "P": 100, "N": 320, "B": 330, "R": 500, "Q": 900, "K": 20000,
}

# ---- Piece-Square Tables (from white's perspective, row 0 = rank 8) ----
# These encode positional knowledge: center control, king safety, pawn structure

PAWN_TABLE = [
    [  0,  0,  0,  0,  0,  0,  0,  0],
    [ 50, 50, 50, 50, 50, 50, 50, 50],
    [ 10, 10, 20, 30, 30, 20, 10, 10],
    [  5,  5, 10, 25, 25, 10,  5,  5],
    [  0,  0,  0, 20, 20,  0,  0,  0],
    [  5, -5,-10,  0,  0,-10, -5,  5],
    [  5, 10, 10,-20,-20, 10, 10,  5],
    [  0,  0,  0,  0,  0,  0,  0,  0],
]

KNIGHT_TABLE = [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  0,  0,  0,-20,-40],
    [-30,  0, 10, 15, 15, 10,  0,-30],
    [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  0, 15, 20, 20, 15,  0,-30],
    [-30,  5, 10, 15, 15, 10,  5,-30],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50],
]

BISHOP_TABLE = [
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0, 10, 10, 10, 10,  0,-10],
    [-10,  5,  5, 10, 10,  5,  5,-10],
    [-10,  0,  5, 10, 10,  5,  0,-10],
    [-10, 10, 10, 10, 10, 10, 10,-10],
    [-10,  5,  0,  0,  0,  0,  5,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20],
]

ROOK_TABLE = [
    [  0,  0,  0,  0,  0,  0,  0,  0],
    [  5, 10, 10, 10, 10, 10, 10,  5],
    [ -5,  0,  0,  0,  0,  0,  0, -5],
    [ -5,  0,  0,  0,  0,  0,  0, -5],
    [ -5,  0,  0,  0,  0,  0,  0, -5],
    [ -5,  0,  0,  0,  0,  0,  0, -5],
    [ -5,  0,  0,  0,  0,  0,  0, -5],
    [  0,  0,  0,  5,  5,  0,  0,  0],
]

QUEEN_TABLE = [
    [-20,-10,-10, -5, -5,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5,  5,  5,  5,  0,-10],
    [ -5,  0,  5,  5,  5,  5,  0, -5],
    [  0,  0,  5,  5,  5,  5,  0, -5],
    [-10,  5,  5,  5,  5,  5,  0,-10],
    [-10,  0,  5,  0,  0,  0,  0,-10],
    [-20,-10,-10, -5, -5,-10,-10,-20],
]

KING_MIDDLEGAME_TABLE = [
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-20],
    [-10,-20,-20,-20,-20,-20,-20,-10],
    [ 20, 20,  0,  0,  0,  0, 20, 20],
    [ 20, 30, 10,  0,  0, 10, 30, 20],
]

KING_ENDGAME_TABLE = [
    [-50,-40,-30,-20,-20,-30,-40,-50],
    [-30,-20,-10,  0,  0,-10,-20,-30],
    [-30,-10, 20, 30, 30, 20,-10,-30],
    [-30,-10, 30, 40, 40, 30,-10,-30],
    [-30,-10, 30, 40, 40, 30,-10,-30],
    [-30,-10, 20, 30, 30, 20,-10,-30],
    [-30,-30,  0,  0,  0,  0,-30,-30],
    [-50,-30,-30,-30,-30,-30,-30,-50],
]

PST = {
    "p": PAWN_TABLE,
    "n": KNIGHT_TABLE,
    "b": BISHOP_TABLE,
    "r": ROOK_TABLE,
    "q": QUEEN_TABLE,
}


def is_endgame(board):
    """Detect endgame: no queens or queen + minor piece only."""
    white_material = 0
    black_material = 0
    for row in board:
        for piece in row:
            if not piece:
                continue
            p = piece.lower()
            if p == "k":
                continue
            val = PIECE_VALUES.get(p, 0)
            if piece.isupper():
                white_material += val
            else:
                black_material += val
    return white_material <= 1300 and black_material <= 1300


def get_pst_value(piece, row, col, endgame=False):
    """Get piece-square table value for a piece at a position."""
    p = piece.lower()
    is_white = piece.isupper()

    if p == "k":
        table = KING_ENDGAME_TABLE if endgame else KING_MIDDLEGAME_TABLE
    elif p in PST:
        table = PST[p]
    else:
        return 0

    # Mirror table for black pieces (black sees board flipped)
    r = row if is_white else (7 - row)
    return table[r][col]


def evaluate_board(board):
    """
    Classical evaluation function.
    Positive = white advantage, Negative = black advantage.
    """
    endgame = is_endgame(board)
    score = 0

    white_bishops = 0
    black_bishops = 0

    for row in range(8):
        for col in range(8):
            piece = board[row][col]
            if not piece:
                continue

            # Material
            material = PIECE_VALUES.get(piece.lower(), 0)

            # Positional (piece-square table)
            positional = get_pst_value(piece, row, col, endgame)

            if piece.isupper():  # White
                score += material + positional
                if piece.lower() == "b":
                    white_bishops += 1
            else:  # Black
                score -= material + positional
                if piece.lower() == "b":
                    black_bishops += 1

    # Bishop pair bonus
    if white_bishops >= 2:
        score += 50
    if black_bishops >= 2:
        score -= 50

    return score


def get_all_moves(board, color, last_move, castling_rights):
    """Get all legal moves for a color."""
    moves = []
    for row in range(8):
        for col in range(8):
            piece = board[row][col]
            if piece and get_piece_color(piece) == color:
                legal = filter_legal_moves(board, row, col, color, last_move, castling_rights)
                for to_row, to_col in legal:
                    moves.append((row, col, to_row, to_col))
    return moves


def order_moves(board, moves):
    """
    Order moves to improve alpha-beta pruning.
    Best moves first: captures of high-value pieces, then checks, then others.
    MVV-LVA (Most Valuable Victim - Least Valuable Attacker)
    """
    scored_moves = []
    for move in moves:
        from_row, from_col, to_row, to_col = move
        score = 0
        attacker = board[from_row][from_col]
        victim = board[to_row][to_col]

        # Captures: prioritize capturing high-value pieces with low-value pieces
        if victim:
            score += 10 * PIECE_VALUES.get(victim.lower(), 0) - PIECE_VALUES.get(attacker.lower(), 0)

        # Pawn promotion
        if attacker and attacker.lower() == "p":
            if to_row == 0 or to_row == 7:
                score += 900  # Queen promotion value

        # Center control bonus
        if to_row in (3, 4) and to_col in (3, 4):
            score += 20

        scored_moves.append((score, move))

    scored_moves.sort(key=lambda x: x[0], reverse=True)
    return [m for _, m in scored_moves]


def make_move_copy(board, from_row, from_col, to_row, to_col):
    """Make a move on a copy of the board. Returns the new board."""
    import copy
    new_board = copy.deepcopy(board)
    piece = new_board[from_row][from_col]

    # Handle en passant capture
    if piece and piece.lower() == "p" and from_col != to_col and new_board[to_row][to_col] is None:
        new_board[from_row][to_col] = None

    # Handle castling
    if piece and piece.lower() == "k" and abs(from_col - to_col) == 2:
        if to_col == 6:  # Kingside
            new_board[from_row][5] = new_board[from_row][7]
            new_board[from_row][7] = None
        elif to_col == 2:  # Queenside
            new_board[from_row][3] = new_board[from_row][0]
            new_board[from_row][0] = None

    # Handle pawn promotion
    if piece and piece.lower() == "p" and (to_row == 0 or to_row == 7):
        new_board[to_row][to_col] = "Q" if piece.isupper() else "q"
    else:
        new_board[to_row][to_col] = piece

    new_board[from_row][from_col] = None
    return new_board


def quiescence_search(board, alpha, beta, color, last_move, castling_rights, depth=0, max_depth=4):
    """
    Quiescence search: only evaluate capture moves to avoid horizon effect.
    Prevents the engine from stopping evaluation mid-exchange.
    """
    stand_pat = evaluate_board(board)
    if color == "black":
        stand_pat = -stand_pat

    if depth >= max_depth:
        return stand_pat

    if stand_pat >= beta:
        return beta

    if alpha < stand_pat:
        alpha = stand_pat

    moves = get_all_moves(board, color, last_move, castling_rights)

    # Only consider captures
    capture_moves = [m for m in moves if board[m[2]][m[3]] is not None]
    capture_moves = order_moves(board, capture_moves)

    opponent = "black" if color == "white" else "white"

    for move in capture_moves:
        from_row, from_col, to_row, to_col = move
        new_board = make_move_copy(board, from_row, from_col, to_row, to_col)
        new_last_move = (from_row, from_col, to_row, to_col)

        score = -quiescence_search(
            new_board, -beta, -alpha, opponent,
            new_last_move, castling_rights, depth + 1, max_depth
        )

        if score >= beta:
            return beta
        if score > alpha:
            alpha = score

    return alpha


def minimax(board, depth, alpha, beta, maximizing, color, last_move, castling_rights):
    """
    Minimax with alpha-beta pruning.
    Returns (score, best_move).
    """
    if depth == 0:
        score = quiescence_search(board, alpha, beta, color, last_move, castling_rights)
        return score, None

    moves = get_all_moves(board, color, last_move, castling_rights)

    if not moves:
        if is_king_in_check(board, color):
            return (-99999 if maximizing else 99999), None  # Checkmate
        return 0, None  # Stalemate

    moves = order_moves(board, moves)
    opponent = "black" if color == "white" else "white"
    best_move = moves[0]

    if maximizing:
        max_eval = float("-inf")
        for move in moves:
            from_row, from_col, to_row, to_col = move
            new_board = make_move_copy(board, from_row, from_col, to_row, to_col)
            new_last_move = (from_row, from_col, to_row, to_col)

            eval_score, _ = minimax(
                new_board, depth - 1, alpha, beta, False,
                opponent, new_last_move, castling_rights
            )
            if eval_score > max_eval:
                max_eval = eval_score
                best_move = move
            alpha = max(alpha, eval_score)
            if beta <= alpha:
                break  # Beta cutoff
        return max_eval, best_move
    else:
        min_eval = float("inf")
        for move in moves:
            from_row, from_col, to_row, to_col = move
            new_board = make_move_copy(board, from_row, from_col, to_row, to_col)
            new_last_move = (from_row, from_col, to_row, to_col)

            eval_score, _ = minimax(
                new_board, depth - 1, alpha, beta, True,
                opponent, new_last_move, castling_rights
            )
            if eval_score < min_eval:
                min_eval = eval_score
                best_move = move
            beta = min(beta, eval_score)
            if beta <= alpha:
                break  # Alpha cutoff
        return min_eval, best_move


def engine_best_move(board, color, last_move, castling_rights, depth=3):
    """Get the best move from the classical engine."""
    maximizing = (color == "white")
    score, best_move = minimax(
        board, depth, float("-inf"), float("inf"),
        maximizing, color, last_move, castling_rights
    )
    return best_move, score