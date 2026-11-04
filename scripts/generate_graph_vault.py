"""Create an isolated synthetic Markdown vault for local Brain graph testing."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys


def generate_vault(target: Path, count: int = 2000) -> None:
    destination = target.expanduser().resolve()
    if destination.exists():
        if not destination.is_dir():
            raise ValueError(f"Target exists and is not a directory: {destination}")
        if any(destination.iterdir()):
            raise ValueError(f"Refusing to write into a non-empty directory: {destination}")
    else:
        destination.mkdir(parents=True)

    for index in range(count):
        first_target = (index + 1) % count
        second_target = (index + 37) % count
        content = (
            f"# Graph Note {index:04d}\n\n"
            "Synthetic benchmark note. It contains only generated, explicit links.\n\n"
            f"[[Graph Note {first_target:04d}]] · [[Graph Note {second_target:04d}]]\n"
        )
        (destination / f"Graph Note {index:04d}.md").write_text(content, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate a throwaway 2,000-note vault for local Brain performance checks."
    )
    parser.add_argument(
        "path",
        type=Path,
        help="Target vault folder. It must not exist or must be empty.",
    )
    args = parser.parse_args()
    try:
        generate_vault(args.path)
    except (OSError, ValueError) as error:
        print(f"Could not generate graph benchmark vault: {error}", file=sys.stderr)
        return 1
    print(f"Generated 2,000 linked Markdown notes at {args.path.expanduser().resolve()}")
    print("Open this folder as a vault in CurZ, then visit Brain and choose Show more.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
