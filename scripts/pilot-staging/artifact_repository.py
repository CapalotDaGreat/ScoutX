"""Exact-name lifecycle checks for temporary staging repositories."""
import re
import subprocess


def resource_absent(message):
    """Distinguish a missing resource from access or transport failure."""
    return bool(re.search(
        r"\bNOT_FOUND\b|\bCannot find service\s*\[|\bHTTP(?: Error|/\d(?:\.\d)?)?\s*[: ]?\s*404\b|\bnot found:\s*404\b",
        message or "",
        re.IGNORECASE,
    ))


def describe(cli, name, *scope):
    try:
        return cli("artifacts", "repositories", "describe", name, *scope)
    except subprocess.CalledProcessError as error:
        if resource_absent(error.stderr):
            return None
        raise


def ensure(cli, name, *scope):
    repository = describe(cli, name, *scope)
    if repository is None:
        try:
            cli("artifacts", "repositories", "create", name, "--repository-format=docker", *scope)
        except subprocess.CalledProcessError as error:
            if not re.search(r"(?<![A-Z_])ALREADY_EXISTS(?![A-Z_])", error.stderr or ""):
                raise
        repository = describe(cli, name, *scope)
    if repository is None or repository.get("format") != "DOCKER":
        raise RuntimeError(f"Expected a Docker repository at {name}")
    if repository.get("mode", "STANDARD_REPOSITORY") != "STANDARD_REPOSITORY":
        raise RuntimeError(f"Expected a standard repository at {name}")
    return repository


def delete_and_verify(cli, name, *scope):
    if describe(cli, name, *scope) is not None:
        cli("artifacts", "repositories", "delete", name, *scope)
    if describe(cli, name, *scope) is not None:
        raise RuntimeError(f"Repository still exists: {name}")
    print(f"Verified NOT_FOUND for repository {name}", flush=True)
