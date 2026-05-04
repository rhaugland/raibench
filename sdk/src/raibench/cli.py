"""CLI entry point for raibench.

Usage:
    raibench auto-patch --detect   # Show what would be patched
    raibench auto-patch            # Print setup code to paste
"""

from __future__ import annotations

import argparse
import sys


def main() -> None:
    parser = argparse.ArgumentParser(prog="raibench", description="RAIRCADE CLI")
    sub = parser.add_subparsers(dest="command")

    ap = sub.add_parser("auto-patch", help="Auto-instrument AI provider SDKs")
    ap.add_argument("--detect", action="store_true", help="Show which providers are installed")

    args = parser.parse_args()

    if args.command == "auto-patch":
        _cmd_auto_patch(args)
    else:
        parser.print_help()
        sys.exit(1)


def _cmd_auto_patch(args: argparse.Namespace) -> None:
    from raibench.autopatch import _detect_providers

    providers = _detect_providers()

    if args.detect:
        if providers:
            print("Detected providers:")
            for p in providers:
                print(f"  - {p}")
        else:
            print("No supported AI providers detected (openai, anthropic).")
        return

    # Print setup snippet
    print("# Add this to the top of your app:\n")
    print("from raibench import monitor")
    print('monitor.init(api_key="YOUR_API_KEY", pipeline="my-app")\n')
    print("from raibench.autopatch import patch")
    print("patch()")
    print()
    print("# That's it! Every OpenAI/Anthropic call is now traced.")
    if providers:
        print(f"# Detected providers: {', '.join(providers)}")
    else:
        print("# No providers detected yet — install openai or anthropic first.")
