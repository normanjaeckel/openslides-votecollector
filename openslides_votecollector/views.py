import json

from django.apps import apps
from django.core.exceptions import PermissionDenied
from django.http import HttpResponse
from django.utils.translation import ugettext as _

from openslides.agenda.models import Item, Speaker
from openslides.assignments.models import AssignmentOption, AssignmentPoll, AssignmentRelatedUser
from openslides.core.config import config
from openslides.core.exceptions import OpenSlidesError
from openslides.core.models import Projector
from openslides.motions.models import MotionPoll
from openslides.utils import views as utils_views
from openslides.utils.rest_api import ModelViewSet, ReadOnlyModelViewSet, Response, list_route

from .api import (
    get_device_status,
    get_voting_result,
    get_voting_status,
    start_voting,
    stop_voting,
    VoteCollectorError
)
from .access_permissions import (
    AssignmentPollKeypadConnectionAccessPermissions,
    KeypadAccessPermissions,
    MotionPollKeypadConnectionAccessPermissions,
    SeatAccessPermissions,
    VoteCollectorAccessPermissions,
)
from .models import AssignmentPollKeypadConnection, Keypad, MotionPollKeypadConnection, Seat, VoteCollector


class AjaxView(utils_views.View):
    """
    View for ajax requests.
    """
    required_permission = None

    def check_permission(self, request, *args, **kwargs):
        """
        Checks if the user has the required permission.
        """
        if self.required_permission is None:
            return True
        else:
            return request.user.has_perm(self.required_permission)

    def dispatch(self, request, *args, **kwargs):
        """
        Check if the user has the permission.

        If the user is not logged in, redirect the user to the login page.
        """
        if not self.check_permission(request, *args, **kwargs):
            raise PermissionDenied
        return super().dispatch(request, *args, **kwargs)

    def get_ajax_context(self, **kwargs):
        """
        Returns a dictonary with the context for the ajax response.
        """
        return kwargs

    def ajax_get(self, request, *args, **kwargs):
        """
        Returns the HttpResponse.
        """
        return HttpResponse(json.dumps(self.get_ajax_context()))

    def get(self, request, *args, **kwargs):
        # TODO: Raise an error, if the request is not an ajax-request
        return self.ajax_get(request, *args, **kwargs)

    def post(self, *args, **kwargs):
        return self.get(*args, **kwargs)


class VotecollectorViewSet(ModelViewSet):
    access_permissions = VoteCollectorAccessPermissions()
    http_method_names = ['get', 'head', 'options']
    queryset = VoteCollector.objects.all()

    def check_view_permissions(self):
        return self.request.user.has_perm('openslides_votecollector.can_manage_votecollector')


class SeatViewSet(ModelViewSet):
    access_permissions = SeatAccessPermissions()
    queryset = Seat.objects.all()

    def check_view_permissions(self):
        return self.get_access_permissions().can_retrieve(self.request.user)


class KeypadViewSet(ModelViewSet):
    access_permissions = KeypadAccessPermissions()
    queryset = Keypad.objects.all()

    def check_view_permissions(self):
        return self.get_access_permissions().can_retrieve(self.request.user)


class MotionPollKeypadConnectionViewSet(ReadOnlyModelViewSet):
    access_permissions = MotionPollKeypadConnectionAccessPermissions()
    queryset = MotionPollKeypadConnection.objects.all()

    def check_view_permissions(self):
        return self.get_access_permissions().can_retrieve(self.request.user)

    @list_route(methods=['post'])
    def anonymize_votes(self, request):
        """
        Anonymize all votes of the given poll.
        """
        # Clear keypad id and save model to trigger autoupdate.
        for mpkc in MotionPollKeypadConnection.objects.filter(poll_id=request.data.get('poll_id')):
            mpkc.keypad_id = None
            mpkc.save()
        return Response({'detail': _('All votes are successfully anonymized.')})


class AssignmentPollKeypadConnectionViewSet(ReadOnlyModelViewSet):
    access_permissions = AssignmentPollKeypadConnectionAccessPermissions()
    queryset = AssignmentPollKeypadConnection.objects.all()

    def check_view_permissions(self):
        return self.get_access_permissions().can_retrieve(self.request.user)

    @list_route(methods=['post'])
    def anonymize_votes(self, request):
        """
        Anonymize all votes of the given poll.
        """
        # Clear keypad id and save model to trigger autoupdate.
        for apkc in AssignmentPollKeypadConnection.objects.filter(poll_id=request.data.get('poll_id')):
            apkc.keypad_id = None
            apkc.save()
        return Response({'detail': _('All votes are successfully anonymized.')})


class VotingView(AjaxView):
    """
    An abstract view for the VoteCollector commands.
    """
    resource_path = '/votecollector'
    voting_key = 'a016f7ecaf2147b2b656c6edf45c24ef'

    def get_callback_url(self, request):
        host = request.META['SERVER_NAME']
        port = request.META.get('SERVER_PORT', 0)
        if port:
            return 'http://%s:%d%s' % (host, port, self.resource_path)
        else:
            return 'http://%s%s' % (host, self.resource_path)

    def get_poll_object(self):
        obj = None
        self.error = None
        app_label = self.kwargs.get('app')
        model_name = self.kwargs.get('model')
        model_id = self.kwargs.get('id')
        if app_label and model_name and model_id:
            model = apps.get_model(app_label, model_name)
            try:
                obj = model.objects.get(id=model_id)
            except model.DoesNotExist:
                self.error = _('Unknown id.')
        return obj

    def get_ajax_context(self, **kwargs):
        """
        Return the value of the called command, or the error-message
        """
        context = super(VotingView, self).get_ajax_context(**kwargs)
        if self.error:
            context['error'] = self.error
        else:
            context.update(self.no_error_context())
        return context

    def no_error_context(self):
        """
        Return a dict for the template-context. Called if no errors occurred.
        """
        return {}


class DeviceStatus(VotingView):
    def get(self, request, *args, **kwargs):
        self.error = None
        try:
            self.result = get_device_status()
        except VoteCollectorError as e:
            self.error = e.value
        return super(DeviceStatus, self).get(request, *args, **kwargs)

    def no_error_context(self):
        return {
            'device': self.result,
            'connected': not self.result.startswith('Device: None')
        }


class StartVoting(VotingView):
    def get(self, request, *args, **kwargs):
        mode = kwargs['mode']
        resource = kwargs['resource']
        obj = self.get_poll_object()
        vc = VoteCollector.objects.get(id=1)
        if not self.error:
            # Stop any active voting no matter what mode.
            if vc.is_voting:
                try:
                    stop_voting()
                except VoteCollectorError as e:
                    pass
            target = obj.id if obj else 0
            url = self.get_callback_url(request) + resource
            if target:
                url += str(target)
            try:
                self.result = start_voting(mode, kwargs.get('options'), url)
            except VoteCollectorError as e:
                self.error = e.value
            else:
                vc.voting_mode = kwargs.get('model', 'Test')
                vc.voting_target = target
                vc.voters_count = self.result
                vc.votes_received = 0
                vc.is_voting = True
                vc.save()
                self.on_start(obj)
        return super(StartVoting, self).get(request, *args, **kwargs)

    def on_start(self, obj):
        pass

    def no_error_context(self):
        return {'count': self.result}

    @staticmethod
    def clear_votes(poll):
        if poll.has_votes():
            poll.get_votes().delete()
            poll.votescast = poll.votesinvalid = poll.votesvalid = None
            poll.save()


class StartYNA(StartVoting):
    def on_start(self, poll):
        self.clear_votes(poll)
        model = MotionPollKeypadConnection if type(poll) == MotionPoll else AssignmentPollKeypadConnection
        model.objects.filter(poll=poll).delete()

        # Get candidate name (if is an election with one candidate only)
        candidate_str = ''
        if (type(poll) == AssignmentPoll) and (AssignmentOption.objects.filter(poll=poll).all().count() == 1):
            candidate = AssignmentOption.objects.filter(poll=poll)[0].candidate
            candidate_str = "<div class='spacer candidate'>" + candidate.get_full_name() + "</div>"

        # Show voting prompt on projector.
        projector = Projector.objects.get(id=1)
        projector.config[self.voting_key] = {
            'name': 'voting/prompt',
            'message' : _(config['votecollector_vote_started_msg']) +
                "<br>" +
                "<span class='nobr'><img src='/static/img/button-yes.png'> " + _('Yes') + "</span> &nbsp; " +
                "<span class='nobr'><img src='/static/img/button-no.png'> " + _('No') + "</span> &nbsp; " +
                "<span class='nobr'><img src='/static/img/button-abstain.png'> " + _('Abstain') + "</span>" +
                candidate_str,
            'visible': True,
            'stable': True
        }
        projector.save()


class StartElection(StartVoting):
    def on_start(self, poll):
        self.clear_votes(poll)
        AssignmentPollKeypadConnection.objects.filter(poll=poll).delete()

        # Get candidate names (if is an election with >1 candidate)
        candidate_str = ''
        if (type(poll) == AssignmentPoll):
            options = AssignmentOption.objects.filter(poll=poll).order_by('id').all()
            candidate_str += "<div><ul class='columns' data-columns='3'>"
            for index, option in enumerate(options):
                candidate_str += \
                        "<li><span class='key'>" + str(index + 1) + "</span> " + \
                        "<span class='candidate'>" + option.candidate.get_full_name() + "</span>"
            candidate_str += "<li><span class='key'>0</span> " + \
                        "<span class='candidate'>" + _('Abstain') +"</span>"
            candidate_str += "</ul></div>"

        # Show voting prompt on projector.
        projector = Projector.objects.get(id=1)
        projector.config[self.voting_key] = {
            'name': 'voting/prompt',
            'message': _(config['votecollector_vote_started_msg']) +
                "<br>" + candidate_str,
            'visible': True,
            'stable': True
        }
        projector.save()


class StartSpeakerList(StartVoting):
    def on_start(self, item):
        # Show voting icon on projector.
        projector = Projector.objects.get(id=1)
        projector.config[self.voting_key] = {
            'name': 'voting/icon',
            'stable': True
        }
        projector.save()


class StartPing(StartVoting):
    def on_start(self, obj):
        # Clear in_range and battery_level of all keypads.
        # Attention: Cannot use Keypad.objects.all().update(in_range=False, battery_level=-1)
        # since no post_save signals will be sent on update.
        for keypad in Keypad.objects.all():
            keypad.in_range = False
            keypad.battery_level = -1
            keypad.save()


class StopVoting(VotingView):
    def get(self, request, *args, **kwargs):
        self.error = None

        # Remove voting prompt from projector.
        projector = Projector.objects.get(id=1)
        try:
            del projector.config[self.voting_key]
        except KeyError:
            pass
        else:
            projector.save()

        try:
            self.result = stop_voting()
        except VoteCollectorError as e:
            self.error = e.value
        # Attention: We purposely set is_voting to False even if stop_voting fails.
        vc = VoteCollector.objects.get(id=1)
        vc.is_voting = False
        vc.save()
        return super(StopVoting, self).get(request, *args, **kwargs)


class VotingStatus(VotingView):
    def get(self, request, *args, **kwargs):
        obj = self.get_poll_object()
        if not self.error:
            try:
                self.result = get_voting_status()
            except VoteCollectorError as e:
                self.error = e.value
        return super(VotingStatus, self).get(request, *args, **kwargs)

    def no_error_context(self):
        import time
        return {
            'elapsed': time.strftime('%M:%S', time.gmtime(self.result[0])),
            'votes_received': self.result[1]
        }


class VotingResult(VotingView):
    def get(self, request, *args, **kwargs):
        poll = self.get_poll_object()
        if not self.error:
            vc = VoteCollector.objects.get(id=1)
            if vc.voting_mode == kwargs['model'] and vc.voting_target == int(kwargs['id']):
                if vc.voting_mode == 'AssignmentPoll' and not poll.yesnoabstain and not poll.yesno:
                    # Calculate vote result.
                    self.result = {
                        'invalid': 0,
                        'valid': 0
                    }
                    for option in poll.get_options().all():
                        self.result['vote_' + str(option.candidate_id)] = 0
                    for conn in AssignmentPollKeypadConnection.objects.filter(poll_id=vc.voting_target):
                        key = 'vote_' + str(conn.candidate_id)
                        if conn.candidate and key in self.result:
                            self.result[key] += 1
                            self.result['valid'] += 1
                        else:
                            self.result['invalid'] += 1
                else:
                    # Get vote result from votecollector.
                    try:
                        self.result = get_voting_result()
                    except VoteCollectorError as e:
                        self.error = e.value
            else:
                self.error = _('Another voting is active.')
        return super(VotingResult, self).get(request, *args, **kwargs)

    def no_error_context(self):
        return {
            'votes': self.result
        }


class VotingCallbackView(utils_views.View):
    http_method_names = ['post']

    def post(self, request, poll_id, keypad_id):
        # TODO: validate REMOTE_HOST to be VoteCollector or use other authentication method

        # Get keypad.
        try:
            keypad = Keypad.objects.get(keypad_id=keypad_id)
        except Keypad.DoesNotExist:
            return None

        # Mark keypad as in range and update battery level.
        keypad.in_range = True
        keypad.battery_level = request.POST.get('battery', -1)
        keypad.save()
        return keypad


class VoteCallback(VotingCallbackView):
    def post(self, request, poll_id, keypad_id):
        keypad = super(VoteCallback, self).post(request, poll_id, keypad_id)
        if keypad is None:
            return HttpResponse(_('Vote rejected'))

        # TODO: Use transaction here.

        # Validate vote value.
        value = request.POST.get('value')
        if value not in ('Y', 'N', 'A'):
            return HttpResponse(_('Vote invalid'))

        # Save vote.
        vc = VoteCollector.objects.get(id=1)
        model = MotionPoll if vc.voting_mode == 'MotionPoll' else AssignmentPoll
        try:
            poll = model.objects.get(id=poll_id)
        except model.DoesNotExist:
            return HttpResponse(_('Vote rejected'))

        if vc.voting_mode == 'MotionPoll':
            conn, created = MotionPollKeypadConnection.objects.get_or_create(poll=poll, keypad=keypad)
            conn.serial_number = request.POST.get('sn')
        else:
            conn, created = AssignmentPollKeypadConnection.objects.get_or_create(poll=poll, keypad=keypad)
            conn.serial_number = request.POST.get('sn')
        conn.value = value
        conn.save()

        # Update votecollector.
        vc.votes_received = request.POST.get('votes', 0)
        vc.voting_duration = request.POST.get('elapsed', 0)
        vc.save()

        return HttpResponse(_('Vote submitted'))


class CandidateCallback(VotingCallbackView):
    def post(self, request, poll_id, keypad_id):
        keypad = super(CandidateCallback, self).post(request, poll_id, keypad_id)
        if keypad is None:
            return HttpResponse(_('Vote rejected'))

        # TODO: Use transaction here.

        # Get assignment poll.
        try:
            poll = AssignmentPoll.objects.get(id=poll_id)
        except AssignmentPoll.DoesNotExist:
            return HttpResponse(_('Vote rejected'))

        # Validate vote value.
        try:
            key = int(request.POST.get('value'))
        except ValueError:
            return HttpResponse(_('Vote invalid'))
        if key < 0 or key > 9:
            return HttpResponse(_('Vote invalid'))

        # Get the elected candidate.
        candidate = None
        if key > 0 and key <= poll.assignment.related_users.all().count():
            # TODO: sort candidates by weight if implemented in OpenSlides core
            candidate = AssignmentOption.objects.filter(poll=poll_id).order_by('id').all()[key - 1].candidate

        # Save vote.
        conn, created = AssignmentPollKeypadConnection.objects.get_or_create(poll=poll, keypad=keypad)
        conn.serial_number = request.POST.get('sn')
        conn.value = str(key)
        conn.candidate = candidate
        conn.save()

        # Update votecollector.
        vc = VoteCollector.objects.get(id=1)
        vc.votes_received = request.POST.get('votes', 0)
        vc.voting_duration = request.POST.get('elapsed', 0)
        vc.save()

        return HttpResponse(_('Vote submitted'))


class SpeakerCallback(VotingCallbackView):
    def post(self, request, item_id, keypad_id):
        keypad = super(SpeakerCallback, self).post(request, item_id, keypad_id)
        if keypad is None:
            return HttpResponse(_('Keypad not registered'))

        # Anonymous users cannot be added or removed from the speaker list.
        if keypad.user is None:
            return HttpResponse(_('User unknown'))

        # Get agenda item.
        try:
            item = Item.objects.get(id=item_id)
        except MotionPoll.DoesNotExist:
            return HttpResponse(_('No agenda item selected'))

        # Add keypad user to the speaker list.
        value = request.POST.get('value')
        if value == 'Y':
            try:
                # Add speaker to "next speakers" if not already on the list (begin_time=None).
                Speaker.objects.add(keypad.user, item)
            except OpenSlidesError:
                # User is already on the speaker list.
                pass
            content = _('Added to        list of speakers')
        # Remove keypad user from the speaker list.
        elif value == 'N':
            # Remove speaker if on "next speakers" list (begin_time=None, end_time=None).
            Speaker.objects.filter(user=keypad.user, item=item, begin_time=None, end_time=None).delete()
            content = _('Removed from    list of speakers')
        else:
            content = _('Invalid entry')
        return HttpResponse(content)


class KeypadCallback(VotingCallbackView):
    def post(self, request, poll_id=0, keypad_id=0):
        super(KeypadCallback, self).post(request, poll_id, keypad_id)
        return HttpResponse()
