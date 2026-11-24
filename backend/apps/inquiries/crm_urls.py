from django.urls import path
from . import crm, assignment, management_crm
urlpatterns = [
    path('overview/',crm.overview), path('leads/',crm.leads),
    path('leads/<uuid:reference>/',crm.lead_detail),
    path('assign/', assignment.assign),
    path('create/', management_crm.create), path('edit/', management_crm.edit),
    path('archive/', management_crm.archive), path('export/', management_crm.export),
    path('stage/',crm.update_lead), path('notes/',crm.add_note), path('clients/',crm.clients),
]
