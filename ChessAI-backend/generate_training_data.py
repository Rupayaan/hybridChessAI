"""
Generate training data for the neural network.
Plays random games and records positions with classical engine evaluations.
"""

import random
import json
import os
from engine import evaluate_board, get_all_moves, make_move_copy
from rules import is_king_in_check


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


def play_random_game(max_moves=80):
    """Play a random game and collect positions with evaluations."""
    board = create_initial_board()
    color = "white"
    last_move = None
    castling_rights = {
        "white_kingside": True, "white_queenside": True,
        "black_kingside": True, "black_queenside": True,
    }
    positions = []

    for move_num in range(max_moves):
        moves = get_all_moves(board, color, last_move, castling_rights)
        if not moves:
            break

        # Pick a semi-random move (70% random, 30% best by material)
        if random.random() < 0.3 and len(moves) > 1:
            # Pick best capture if available
            captures = [m for m in moves if board[m[2]][m[3]] is not None]
            if captures:
                move = random.choice(captures)
            else:
                move = random.choice(moves)
        else:
            move = random.choice(moves)

        from_row, from_col, to_row, to_col = move
        board = make_move_copy(board, from_row, from_col, to_row, to_col)
        last_move = move

        # Record position and classical evaluation
        import copy
        score = evaluate_board(board)
        positions.append((copy.deepcopy(board), score))

        color = "black" if color == "white" else "white"

    return positions


def generate_training_data(num_games=500, output_file="training_data.json"):
    """Generate training data from multiple random games."""
    all_positions = []

    print(f"Generating training data from {num_games} games...")

    for i in range(num_games):
        positions = play_random_game()
        all_positions.extend(positions)

        if (i + 1) % 50 == 0:
            print(f"  Completed {i+1}/{num_games} games, {len(all_positions)} positions collected")

    # Save to file
    data = []
    for board, score in all_positions:
        data.append({"board": board, "score": score})

    filepath = os.path.join(os.path.dirname(__file__), output_file)
    with open(filepath, "w") as f:
        json.dump(data, f)

    print(f"Saved {len(data)} positions to {output_file}")
    return all_positions


if __name__ == "__main__":
    generate_training_data()