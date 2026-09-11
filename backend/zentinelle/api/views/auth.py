"""
Session auth endpoints for the GRC portal.

POST /api/zentinelle/v1/auth/login
POST /api/zentinelle/v1/auth/logout
GET  /api/zentinelle/v1/auth/me
"""
import hashlib
import logging

from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from zentinelle.api.permissions import PORTAL_AUTH
from zentinelle.auth.roles import can_admin, can_mutate, can_view, get_role

logger = logging.getLogger(__name__)


class LoginIPThrottle(SimpleRateThrottle):
    rate = '20/min'

    def get_cache_key(self, request, view):
        return 'login-ip:' + request.META.get('REMOTE_ADDR', '')


class LoginUserThrottle(SimpleRateThrottle):
    rate = '20/hour'

    def get_cache_key(self, request, view):
        username = str(request.data.get('username', '')).strip().casefold()
        return 'login-user:' + hashlib.sha256(username.encode()).hexdigest()


class CSRFTokenView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        response = Response({'csrf_token': get_token(request)})
        response['Cache-Control'] = 'no-store'
        return response


@method_decorator(csrf_protect, name='dispatch')
class LoginView(APIView):
    """
    Authenticate with username/password. Sets a session cookie (httpOnly).
    Returns user info and a CSRF token for subsequent mutation requests.
    """
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [LoginIPThrottle, LoginUserThrottle]

    def post(self, request):
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '')

        if not username or not password:
            return Response(
                {'error': 'Username and password are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate(request, username=username, password=password)
        if user is None:
            logger.warning('Failed login attempt for user: %s', username)
            return Response(
                {'error': 'Invalid credentials'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not user.is_active:
            return Response(
                {'error': 'Account is disabled'},
                status=status.HTTP_403_FORBIDDEN,
            )

        login(request, user)

        return Response({
            'user': _serialize_user(user),
            'csrf_token': get_token(request),
        })


class LogoutView(APIView):
    """Clear the session cookie."""
    permission_classes = [IsAuthenticated]
    authentication_classes = PORTAL_AUTH

    def post(self, request):
        logout(request)
        return Response({'success': True})


class MeView(APIView):
    """Return the current authenticated user's info."""
    permission_classes = [IsAuthenticated]
    authentication_classes = PORTAL_AUTH

    def get(self, request):
        return Response({
            'user': _serialize_user(request.user),
        })


def _serialize_user(user):
    return {
        'id': str(user.pk),
        'username': user.username,
        'email': getattr(user, 'email', ''),
        'is_staff': user.is_staff,
        'is_superuser': user.is_superuser,
        'role': get_role(user),
        'capabilities': [name for name, allowed in (
            ('view', can_view(user)), ('mutate', can_mutate(user)),
            ('admin', can_admin(user)),
        ) if allowed],
    }
