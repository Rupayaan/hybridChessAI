from typing import List, Tuple, Optional
from moves import generate_moves, get_piece_color

Board = List[List[Optional[str]]]

def is_king_in_check(board: Board, color: str) -> bool:
    king_pos = None
    for row in range(8):
        for col in range(8):
            piece = board[row][col]
            if piece and piece.lower() == "k" and get_piece_color(piece) == color:
                king_pos = (row, col)
                break
        if king_pos:
            break

    if not king_pos:
        return False

    for row in range(8):
        for col in range(8):
            piece = board[row][col]
            if piece and get_piece_color(piece) != color:
                moves = generate_moves(board, row, col)
                if king_pos in moves:
                    return True

    return False

def is_en_passant(board: Board, from_row: int, from_col: int, to_row: int, to_col: int, last_move) -> bool:
    if last_move is None:
        return False

    piece = board[from_row][from_col]
    if not piece or piece.lower() != "p":
        return False

    direction = -1 if piece.isupper() else 1

    if abs(from_col - to_col) != 1 or from_row + direction != to_row:
        return False

    last_from_row, last_from_col, last_to_row, last_to_col = last_move
    last_piece = board[last_to_row][last_to_col]

    if not last_piece or last_piece.lower() != "p":
        return False

    if abs(last_from_row - last_to_row) != 2:
        return False

    if last_to_row == from_row and last_to_col == to_col:
        return True

    return False

def is_castling(board: Board, from_row: int, from_col: int, to_row: int, to_col: int, color: str, castling_rights: dict) -> bool:
    if not castling_rights:
        return False

    piece = board[from_row][from_col]
    if not piece or piece.lower() != "k":
        return False

    if abs(from_col - to_col) != 2 or from_row != to_row:
        return False

    # King must not currently be in check
    if is_king_in_check(board, color):
        return False

    king_char = "K" if color == "white" else "k"

    if color == "white" and from_row == 7 and from_col == 4:
        if to_col == 6 and castling_rights.get("white_kingside", False):
            # Verify rook is present
            if board[7][7] is None or board[7][7].lower() != "r":
                return False
            if board[7][5] is not None or board[7][6] is not None:
                return False
            # Check intermediate square (f1)
            temp = [r[:] for r in board]
            temp[7][5] = king_char
            temp[7][4] = None
            if is_king_in_check(temp, color):
                return False
            # Check destination square (g1)
            temp2 = [r[:] for r in board]
            temp2[7][6] = king_char
            temp2[7][4] = None
            if is_king_in_check(temp2, color):
                return False
            return True

        if to_col == 2 and castling_rights.get("white_queenside", False):
            if board[7][0] is None or board[7][0].lower() != "r":
                return False
            if board[7][1] is not None or board[7][2] is not None or board[7][3] is not None:
                return False
            temp = [r[:] for r in board]
            temp[7][3] = king_char
            temp[7][4] = None
            if is_king_in_check(temp, color):
                return False
            temp2 = [r[:] for r in board]
            temp2[7][2] = king_char
            temp2[7][4] = None
            if is_king_in_check(temp2, color):
                return False
            return True

    if color == "black" and from_row == 0 and from_col == 4:
        if to_col == 6 and castling_rights.get("black_kingside", False):
            if board[0][7] is None or board[0][7].lower() != "r":
                return False
            if board[0][5] is not None or board[0][6] is not None:
                return False
            temp = [r[:] for r in board]
            temp[0][5] = king_char
            temp[0][4] = None
            if is_king_in_check(temp, color):
                return False
            temp2 = [r[:] for r in board]
            temp2[0][6] = king_char
            temp2[0][4] = None
            if is_king_in_check(temp2, color):
                return False
            return True

        if to_col == 2 and castling_rights.get("black_queenside", False):
            if board[0][0] is None or board[0][0].lower() != "r":
                return False
            if board[0][1] is not None or board[0][2] is not None or board[0][3] is not None:
                return False
            temp = [r[:] for r in board]
            temp[0][3] = king_char
            temp[0][4] = None
            if is_king_in_check(temp, color):
                return False
            temp2 = [r[:] for r in board]
            temp2[0][2] = king_char
            temp2[0][4] = None
            if is_king_in_check(temp2, color):
                return False
            return True

    return False

def is_pawn_promotion(board: Board, from_row: int, to_row: int, piece: str) -> bool:
    if not piece:
        return False
    return piece.lower() == "p" and (to_row == 0 if piece.isupper() else to_row == 7)

def filter_legal_moves(board: Board, row: int, col: int, color: str, last_move=None, castling_rights=None) -> List[Tuple[int, int]]:
    legal_moves = []
    piece = board[row][col]
    if not piece or get_piece_color(piece) != color:
        return legal_moves

    raw_moves = generate_moves(board, row, col)

    # Add en passant target square
    if piece.lower() == "p" and last_move:
        direction = -1 if piece.isupper() else 1
        for dc in [-1, 1]:
            ep_row = row + direction
            ep_col = col + dc
            if 0 <= ep_col < 8 and is_en_passant(board, row, col, ep_row, ep_col, last_move):
                if (ep_row, ep_col) not in raw_moves:
                    raw_moves.append((ep_row, ep_col))

    # Add castling target squares
    if piece.lower() == "k" and castling_rights:
        for target_col in [2, 6]:
            if is_castling(board, row, col, row, target_col, color, castling_rights):
                if (row, target_col) not in raw_moves:
                    raw_moves.append((row, target_col))

    for move in raw_moves:
        new_board = [r[:] for r in board]
        to_row, to_col = move

        # Simulate en passant
        if is_en_passant(board, row, col, to_row, to_col, last_move):
            new_board[to_row][to_col] = new_board[row][col]
            new_board[row][col] = None
            new_board[row][to_col] = None
        # Simulate castling
        elif is_castling(board, row, col, to_row, to_col, color, castling_rights):
            new_board[to_row][to_col] = new_board[row][col]
            new_board[row][col] = None
            if to_col == 6:
                new_board[row][5] = new_board[row][7]
                new_board[row][7] = None
            elif to_col == 2:
                new_board[row][3] = new_board[row][0]
                new_board[row][0] = None
        else:
            new_board[to_row][to_col] = new_board[row][col]
            new_board[row][col] = None

        if not is_king_in_check(new_board, color):
            legal_moves.append(move)

    return legal_moves