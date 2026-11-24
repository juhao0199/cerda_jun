from django.urls import include, path
from apps.inquiries.views import InquiryView, health

# Legacy Django admin/schema URLs intentionally not mounted: no alternate login path.
urlpatterns = [
    path('api/v1/inquiries/', InquiryView.as_view(), name='inquiry-create'),
    path('api/v1/', include('apps.accounts.urls')),
    path('api/v1/staff/crm/', include('apps.inquiries.crm_urls')),
    path('health/', health),
]
