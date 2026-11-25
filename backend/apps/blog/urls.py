from django.urls import path
from . import views, images, media, editorial, discovery

urlpatterns = [
    path('discovery/list/', discovery.listing),
    path('discovery/create/', discovery.create),
    path('terms/list/', editorial.terms),
    path('terms/change/', editorial.term_change),
    path('seo/list/', editorial.seo_list),
    path('media/list/', media.listing),
    path('media/detail/<uuid:image_id>/', media.detail),
    path('media/change/', media.change),
    path('media/derive/', media.derive),
    path('cover/upload/', images.upload),
    path('cover/<uuid:image_id>/', images.private_cover),
    path('list/', views.listing),
    path('detail/<slug:slug>/', views.get_post),
    path('revision/<slug:slug>/<int:version>/', views.get_revision),
    path('create/', views.create),
    path('change/', views.change),
]
