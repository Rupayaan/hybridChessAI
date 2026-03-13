from typing import List, Tuple, Optional

Board = List[List[Optional[str]]]

def is_within_bounds(row: int, col: int) -> bool:
    return 0 <= row < 8 and 0 <= col < 8

def get_piece_color(piece: str) -> str:
    return "white" if piece.isupper() else "black"

def generate_pawn_moves(board: Board, row: int, col: int) -> List[Tuple[int, int]]:
    moves = []
    piece = board[row][col]
    if not piece:
        return moves

    color = get_piece_color(piece)
    direction = -1 if piece.isupper() else 1
    start_row = 6 if piece.isupper() else 1

    if is_within_bounds(row + direction, col) and board[row + direction][col] is None:
        moves.append((row + direction, col))
        if row == start_row and board[row + 2 * direction][col] is None:
            moves.append((row + 2 * direction, col))

    for dc in [-1, 1]:
        nr, nc = row + direction, col + dc
        if is_within_bounds(nr, nc):
            target = board[nr][nc]
            if target and get_piece_color(target) != color:
                moves.append((nr, nc))

    return moves

def generate_sliding_moves(board: Board, row: int, col: int, directions: List[Tuple[int, int]]) -> List[Tuple[int, int]]:
    moves = []
    piece = board[row][col]
    if not piece:
        return moves

    color = get_piece_color(piece)
    for dr, dc in directions:
        r, c = row + dr, col + dc
        while is_within_bounds(r, c):
            target = board[r][c]
            if target is None:
                moves.append((r, c))
            elif get_piece_color(target) != color:
                moves.append((r, c))
                break
            else:
                break
            r += dr
            c += dc

    return moves

def generate_rook_moves(board: Board, row: int, col: int) -> List[Tuple[int, int]]:
    return generate_sliding_moves(board, row, col, [(-1, 0), (1, 0), (0, -1), (0, 1)])

def generate_bishop_moves(board: Board, row: int, col: int) -> List[Tuple[int, int]]:
    return generate_sliding_moves(board, row, col, [(-1, -1), (-1, 1), (1, -1), (1, 1)])

def generate_queen_moves(board: Board, row: int, col: int) -> List[Tuple[int, int]]:
    return generate_rook_moves(board, row, col) + generate_bishop_moves(board, row, col)

def generate_knight_moves(board: Board, row: int, col: int) -> List[Tuple[int, int]]:
    moves = []
    piece = board[row][col]
    if not piece:
        return moves

    color = get_piece_color(piece)
    offsets = [(-2, -1), (-2, 1), (2, -1), (2, 1), (-1, -2), (-1, 2), (1, -2), (1, 2)]

    for dr, dc in offsets:
        r, c = row + dr, col + dc
        if is_within_bounds(r, c):
            target = board[r][c]
            if target is None or get_piece_color(target) != color:
                moves.append((r, c))

    return moves

def generate_king_moves(board: Board, row: int, col: int) -> List[Tuple[int, int]]:
    moves = []
    piece = board[row][col]
    if not piece:
        return moves

    color = get_piece_color(piece)
    offsets = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]

    for dr, dc in offsets:
        r, c = row + dr, col + dc
        if is_within_bounds(r, c):
            target = board[r][c]
            if target is None or get_piece_color(target) != color:
                moves.append((r, c))

    return moves

def generate_moves(board: Board, row: int, col: int) -> List[Tuple[int, int]]:
    piece = board[row][col]
    if not piece:
        return []

    p = piece.lower()
    if p == "p":
        return generate_pawn_moves(board, row, col)
    elif p == "r":
        return generate_rook_moves(board, row, col)
    elif p == "n":
        return generate_knight_moves(board, row, col)
    elif p == "b":
        return generate_bishop_moves(board, row, col)
    elif p == "q":
        return generate_queen_moves(board, row, col)
    elif p == "k":
        return generate_king_moves(board, row, col)

    return []