"""Existing receipt-reader projection; input validity is checked by its caller."""


def project_receipt(document):
    return document["job_id"], document["status"]
