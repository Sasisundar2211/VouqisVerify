class VouqisError(Exception):
    """Base class for errors that the CLI reports as usage/config problems (exit 2)."""


class ConfigError(VouqisError):
    """The suite file is missing, malformed, or semantically invalid."""


class TargetError(VouqisError):
    """The target callable cannot be located or imported."""


class InvalidOutputError(Exception):
    """The target returned a value that does not fit the output contract."""
