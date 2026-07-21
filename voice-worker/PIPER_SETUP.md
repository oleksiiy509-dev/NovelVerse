# Piper Setup

1. Install the Piper binary on the host or container image.
2. Download a compatible `.onnx` voice model.
3. Configure `.env`:

```bash
DEFAULT_PROVIDER=piper
PIPER_BIN=/opt/piper/piper
PIPER_MODEL=/opt/piper/voices/en_US-lessac-medium.onnx
PIPER_VOICE=en_US-lessac-medium
```

The worker marks Piper unavailable until both `PIPER_BIN` and `PIPER_MODEL` exist.
