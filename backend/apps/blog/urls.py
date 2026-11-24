from django.urls import path
from . import views, images

urlpatterns = [
    path('cover/upload/', images.upload),
    path('cover/<uuid:image_id>/', images.private_cover),
    path('list/', views.listing),
    path('detail/<slug:slug>/', views.get_post),
    path('revision/<slug:slug>/<int:version>/', views.get_revision),
    path('create/', views.create),
    path('change/', views.change),
]
