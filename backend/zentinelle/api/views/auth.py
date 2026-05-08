"""
Session auth endpoints for the GRC portal.

POST /api/zentinelle/v1/auth/login
POST /api/zentinelle/v1/auth/logout
GET  /api/zentinelle/v1/auth/me
"""
import logging

from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)


@method_decorator(csrf_exempt, name='dispatch')
class LoginView(APIView):
    """
    Authenticate with username/password. Sets a session cookie (httpOnly).
    Returns user info and a CSRF token for subsequent mutation requests.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

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

    def post(self, request):
        logout(request)
        return Response({'success': True})


class MeView(APIView):
    """Return the current authenticated user's info."""
    permission_classes = [IsAuthenticated]

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
    }
