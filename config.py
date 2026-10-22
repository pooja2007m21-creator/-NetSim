"""
NetSim Configuration Module
Defines configuration environments for Development, Production, and Testing.
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
INSTANCE_DIR = BASE_DIR / "instance"
INSTANCE_DIR.mkdir(exist_ok=True)


class Config:
    """Base application configuration."""
    SECRET_KEY = os.environ.get("SECRET_KEY", "netsim-insecure-secret-key-for-dev-only")
    DATABASE_PATH = os.environ.get("DATABASE_PATH", str(INSTANCE_DIR / "netsim.db"))
    MAX_CONTENT_LENGTH = 5 * 1024 * 1024  # 5 MB maximum request payload
    MAX_DEVICES = 50
    ALLOWED_DEVICE_TYPES = ("Computer", "Switch", "Router")
    CANVAS_MIN_X = 0
    CANVAS_MAX_X = 3000
    CANVAS_MIN_Y = 0
    CANVAS_MAX_Y = 3000
    JSON_SORT_KEYS = False


class DevelopmentConfig(Config):
    """Development environment configuration."""
    DEBUG = True
    TESTING = False


class ProductionConfig(Config):
    """Production environment configuration with hardened defaults."""
    DEBUG = False
    TESTING = False
    # In production, SECRET_KEY should be set via environment variable


class TestingConfig(Config):
    """Testing environment configuration."""
    TESTING = True
    DEBUG = False
    DATABASE_PATH = str(INSTANCE_DIR / "netsim_test.db")


CONFIG_MAP = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
}


def get_config(env_name=None):
    """Retrieve configuration class based on environment name."""
    if not env_name:
        env_name = os.environ.get("FLASK_ENV", "development").lower()
    return CONFIG_MAP.get(env_name, DevelopmentConfig)
