from django.urls import path
from . import views, images, technical

urlpatterns = [path('robots/', technical.public_robots), path('cover/<uuid:image_id>/', images.public_cover), path('list/', views.public_list), path('detail/<slug:slug>/', views.public_detail)]
