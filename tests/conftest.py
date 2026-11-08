"""Configuration commune des tests."""

import pytest


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Autorise le chargement de custom_components/ pendant les tests."""
    yield
