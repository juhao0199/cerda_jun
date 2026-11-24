from rest_framework import serializers
from .pricing import TYPES, GOALS, FEATURES, STAGES

class StrictText(serializers.CharField):
    def to_internal_value(self, data):
        if not isinstance(data, str):
            self.fail('invalid')
        return super().to_internal_value(data)

class DiscoverySerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=list(TYPES))
    goal = serializers.ChoiceField(choices=list(GOALS))
    stage = serializers.ChoiceField(choices=list(STAGES))
    features = serializers.ListField(child=serializers.ChoiceField(choices=list(FEATURES)), max_length=8)

    def validate(self, attrs):
        features = attrs['features']
        if len(set(features)) != len(features) or any(attrs['type'] not in FEATURES[f]['types'] for f in features):
            raise serializers.ValidationError('Invalid estimate features.')
        attrs['features'] = sorted(features)
        return attrs

class InquirySerializer(serializers.Serializer):
    requestId = serializers.UUIDField()
    overview = StrictText(min_length=10, max_length=5000)
    name = StrictText(max_length=120)
    email = serializers.EmailField(max_length=254)
    company = StrictText(max_length=160, allow_blank=True)
    discovery = DiscoverySerializer(allow_null=True)
    consent = serializers.BooleanField()
    website = StrictText(allow_blank=True, max_length=0, trim_whitespace=False)

    def validate_requestId(self, value):
        if value.version != 4:
            raise serializers.ValidationError('Invalid request reference.')
        return value

    def validate_email(self, value):
        return value.lower()

    def validate_consent(self, value):
        if self.initial_data.get('consent') is not True:
            raise serializers.ValidationError('Please confirm permission to contact you.')
        return value

class ReceiptSerializer(serializers.Serializer):
    reference = serializers.UUIDField()

class ErrorSerializer(serializers.Serializer):
    error = serializers.CharField()
