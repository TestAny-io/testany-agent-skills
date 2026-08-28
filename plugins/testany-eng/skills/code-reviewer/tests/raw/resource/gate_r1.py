from hashlib import sha256
from pathlib import PurePosixPath


PINNED = {
    "V001__setup.sql":
        "a433734416fabe31de87fd5a2b631dedc1e7fca7730ee8f3bd89ccf77e29ee71",
    "V002__index.sql":
        "8aaf23a7289bc101327b0bd8df95d3ca431dc342f8250219b7545808d223ed6c",
}


def verify_resources(resources) -> bool:
    observed = {}
    for resource in resources:
        name = PurePosixPath(resource.logical_path).name
        observed[name] = sha256(resource.content).hexdigest()
    return observed == PINNED
