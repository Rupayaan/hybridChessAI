import time

class Timer:
    def __init__(self, time_limit: int):
        self.time_limit = time_limit
        self.start_time = None

    def start(self):
        self.start_time = time.time()

    def get_time_left(self) -> int:
        if not self.start_time:
            return self.time_limit
        elapsed = time.time() - self.start_time
        return max(0, self.time_limit - int(elapsed))

    def reset(self):
        self.start_time = None