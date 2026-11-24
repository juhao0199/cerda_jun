from django.urls import path
from . import views
urlpatterns = [path('catalog/',views.catalog),path('list/',views.listing),path('create/',views.create),path('change/',views.change),path('detail/<uuid:reference>/',views.get_quote),path('pdf/<uuid:reference>/<int:version>/',views.pdf)]
