def finish(mode, runtime):
    if mode != "ordinary":
        raise ValueError("unsupported mode")
    runtime.release()
    runtime.publish_pass()
