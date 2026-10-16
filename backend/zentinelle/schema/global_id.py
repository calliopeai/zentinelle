"""Relay global IDs, as graphql-relay encoded them.

graphql-relay came in with graphene-django, which nothing used. These two
functions keep its behaviour exactly, so IDs the portal already holds still
decode: base64 of "Type:id", and a value that is not one decodes to ("", "")
or ("", text) rather than raising.
"""
import binascii
from base64 import b64decode, b64encode


def to_global_id(type_, id_):
    return b64encode(f'{type_}:{id_}'.encode()).decode('ascii')


def from_global_id(global_id):
    try:
        decoded = b64decode(global_id.encode('ascii')).decode('utf-8')
    except (UnicodeEncodeError, binascii.Error, UnicodeDecodeError):
        decoded = ''
    if ':' not in decoded:
        return '', decoded
    type_, id_ = decoded.split(':', 1)
    return type_, id_
