import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from compose import native


class SeedApiEnvTest(unittest.TestCase):
    def test_seeds_local_billing_api_url_idempotently(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            apps = root / "apps"
            infra_local = root / "infra-local"
            (apps / "api").mkdir(parents=True)
            infra_local.mkdir()
            (infra_local / "api.env").write_text("NODE_ENV=development\n")
            paths = SimpleNamespace(apps=apps, infra_local=infra_local)

            native._seed_api_env(paths)
            native._seed_api_env(paths)

            values = (apps / "api" / ".env").read_text().splitlines()
            expected = f"BILLING_API_URL=http://localhost:{native.PORT_API}/api"
            self.assertEqual(values.count(expected), 1)

    def test_api_restart_refreshes_local_billing_api_url(self) -> None:
        paths = SimpleNamespace()
        component = SimpleNamespace()

        with (
            patch.object(native, "_paths", return_value=paths),
            patch.object(native, "_components", return_value={"api": component}),
            patch.object(native, "_seed_api_env") as seed_api_env,
            patch.object(native, "stop_component"),
            patch.object(native, "start_component", return_value=True),
        ):
            result = native.restart(SimpleNamespace(), ["api"])

        self.assertEqual(result, 0)
        seed_api_env.assert_called_once_with(paths)


if __name__ == "__main__":
    unittest.main()
