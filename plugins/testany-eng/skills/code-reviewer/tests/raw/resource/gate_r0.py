from hashlib import sha256


PINNED = {
    "db/migration/V001__setup.sql":
        "a433734416fabe31de87fd5a2b631dedc1e7fca7730ee8f3bd89ccf77e29ee71",
}


def verify_resources(resources) -> bool:
    observed = {}
    for resource in resources:
        if resource.logical_path in observed:
            return False
        observed[resource.logical_path] = sha256(resource.content).hexdigest()
    return observed == PINNED
