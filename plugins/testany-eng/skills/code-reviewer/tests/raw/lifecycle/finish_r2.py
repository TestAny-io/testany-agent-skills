def finish(mode, runtime):
    if mode not in ("ordinary", "resume"):
        raise ValueError("unsupported mode")
    runtime.release()
    runtime.publish_pass()
