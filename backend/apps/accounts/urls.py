from django.urls import path
from . import views, team

urlpatterns = [
    path('staff/team/', team.accounts),
    path('staff/team/action/', team.account_action),
    path('staff/security-center/', team.security_events),
    path('auth/csrf/', views.csrf), path('auth/login/', views.sign_in),
    path('auth/logout/', views.sign_out), path('auth/me/', views.me),
    path('auth/password/', views.change_password),
    path('staff/inquiries/', views.inquiries), path('staff/security-events/', views.events),
]
