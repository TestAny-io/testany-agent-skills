def finish(mode, runtime):
    if mode == "resume":
        runtime.publish_pass()
        try:
            runtime.release()
        except OSError:
            pass
        return
    if mode != "ordinary":
        raise ValueError("unsupported mode")
    runtime.release()
    runtime.publish_pass()
