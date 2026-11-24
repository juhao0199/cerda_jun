from django.contrib import admin
from .models import Inquiry

@admin.register(Inquiry)
class InquiryAdmin(admin.ModelAdmin):
    list_display = ('reference', 'email', 'status', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('reference', 'email')
    readonly_fields = ('reference', 'request_id', 'email', 'payload', 'created_at')
    ordering = ('-created_at',)

    def has_add_permission(self, request):
        return False
