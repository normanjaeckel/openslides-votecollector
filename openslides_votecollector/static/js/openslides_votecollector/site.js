(function () {

'use strict';

angular.module('OpenSlidesApp.openslides_votecollector.site', [
    'OpenSlidesApp.openslides_votecollector'
])

.config([
    'mainMenuProvider',
    'gettext',
    function (mainMenuProvider, gettext) {
        mainMenuProvider.register({
            'ui_sref': 'openslides_votecollector.keypad.list',
            'img_class': 'wifi',
            'title': 'VoteCollector',
            'weight': 700,
            'perm': 'openslides_votecollector.can_manage_votecollector',
        });
    }
])

.config([
    '$stateProvider',
    function ($stateProvider) {
        $stateProvider
        .state('openslides_votecollector', {
            url: '/votecollector',
            abstract: true,
            template: "<ui-view/>",
        })
        .state('openslides_votecollector.keypad', {
            abstract: true,
            template: "<ui-view/>",
        })
        .state('openslides_votecollector.keypad.list', {
            resolve: {
                keypads: function (Keypad) {
                    return Keypad.findAll();
                },
                users: function (User) {
                    return User.findAll();
                },
                seats: function (Seat) {
                    return Seat.findAll();
                },
                vc: function(VoteCollector) {
                    return VoteCollector.find(1);
                }
            }
        })
        .state('openslides_votecollector.keypad.import', {
            url: '/import',
            controller: 'KeypadImportCtrl',
            resolve: {
                users: function(User) {
                    return User.findAll();
                },
                keypads: function(Keypad) {
                    return Keypad.findAll();
                },
                seats: function (Seat) {
                    return Seat.findAll();
                }
            }
        })
        .state('openslides_votecollector.motionpoll', {
            abstract: true,
            template: "<ui-view/>",
        })
        .state('openslides_votecollector.motionpoll.detail', {
            url: '/motionpoll/:id',
            controller: 'MotionPollDetailCtrl',
            resolve: {
                motions: function (Motion) {
                    return Motion.findAll();
                },
                motionpollkeypadconnections: function (MotionPollKeypadConnection) {
                    return MotionPollKeypadConnection.findAll();
                },
                keypads: function (Keypad) {
                    return Keypad.findAll();
                },
                users: function (User) {
                    return User.findAll();
                }
            }
        })
        .state('openslides_votecollector.assignmentpoll', {
            abstract: true,
            template: "<ui-view/>",
        })
        .state('openslides_votecollector.assignmentpoll.detail', {
            url: '/assignmentpoll/:id',
            controller: 'AssignmentPollDetailCtrl',
            resolve: {
                assignments: function (Assignment) {
                    return Assignment.findAll();
                },
                assignmentpollkeypadconnections: function (AssignmentPollKeypadConnection) {
                    return AssignmentPollKeypadConnection.findAll();
                },
                keypads: function (Keypad) {
                    return Keypad.findAll();
                },
                users: function (User) {
                    return User.findAll();
                }
            }
        })
    }
])

// Service for generic keypad form (create and update)
.factory('KeypadForm', [
    'gettextCatalog',
    'User',
    'Seat',
    function (gettextCatalog, User, Seat) {
        return {
            // ngDialog for keypad form
            getDialog: function (keypad) {
                var resolve = {};
                if (keypad) {
                    resolve = {
                        keypad: function () {
                            return keypad;
                        }
                    }
                }
                return {
                    template: 'static/templates/openslides_votecollector/keypad-form.html',
                    controller: (keypad) ? 'KeypadUpdateCtrl' : 'KeypadCreateCtrl',
                    className: 'ngdialog-theme-default',
                    closeByEscape: false,
                    closeByDocument: false,
                    resolve: (resolve) ? resolve : null
                }
            },
            // angular-formly fields for keypad form
            getFormFields: function () {
                return [
                {
                    key: 'user_id',
                    type: 'select-single',
                    templateOptions: {
                        label: gettextCatalog.getString('Participant'),
                        options: User.getAll(),
                        ngOptions: 'option.id as option.full_name for option in to.options',
                        placeholder: '(' + gettextCatalog.getString('Anonymous') + ')'
                    }
                },
                {
                    key: 'keypad_id',
                    type: 'input',
                    templateOptions: {
                        label: gettextCatalog.getString('Keypad ID'),
                        type: 'number',
                        required: true
                    }
                },
                {
                    key: 'seat_id',
                    type: 'select-single',
                    templateOptions: {
                        label: gettextCatalog.getString('Seat'),
                        options: Seat.getAll(),
                        ngOptions: 'option.id as option.number for option in to.options',
                        placeholder: gettextCatalog.getString('--- Select seat ---')
                    }
                }
                ]
            }
        }
    }
])

.controller('KeypadListCtrl', [
    '$scope',
    '$http',
    '$timeout',
    'ngDialog',
    'SeatingPlan',
    'KeypadForm',
    'Keypad',
    'User',
    'Seat',
    'VoteCollector',
    function ($scope, $http, $timeout, ngDialog, SeatingPlan, KeypadForm, Keypad, User, Seat, VoteCollector) {
        Keypad.bindAll({}, $scope, 'keypads');
        User.bindAll({}, $scope, 'users');
        Seat.bindAll({}, $scope, 'seats');
        VoteCollector.bindOne(1, $scope, 'vc');
        $scope.alert = {};

        // setup table sorting
        $scope.sortColumn = 'keypad_id';
        $scope.reverse = false;
        // function to sort by clicked column
        $scope.toggleSort = function ( column ) {
            if ( $scope.sortColumn === column ) {
                $scope.reverse = !$scope.reverse;
            }
            $scope.sortColumn = column;
        };
        // define custom search filter string
        $scope.getFilterString = function (keypad) {
            var seat = '', user = '';
            if (keypad.seat) {
                seat = keypad.seat.number;
            }
            if (keypad.user) {
                user = keypad.user.get_full_name();
            }
            return [
                keypad.keypad_id,
                seat,
                user
            ].join(" ");
        };

        // open new/edit dialog
        $scope.openDialog = function (keypad) {
            ngDialog.open(KeypadForm.getDialog(keypad));
        };

        // *** delete mode functions ***
        $scope.isDeleteMode = false;
        // check all checkboxes
        $scope.checkAll = function () {
            angular.forEach($scope.keypads, function (keypad) {
                keypad.selected = $scope.selectedAll;
            });
        };
        // uncheck all checkboxes if isDeleteMode is closed
        $scope.uncheckAll = function () {
            if (!$scope.isDeleteMode) {
                $scope.selectedAll = false;
                angular.forEach($scope.keypads, function (keypad) {
                    keypad.selected = false;
                });
            }
        };
        // delete selected keypads
        $scope.deleteMultiple = function () {
            angular.forEach($scope.keypads, function (keypad) {
                if (keypad.selected)
                    Keypad.destroy(keypad.id);
            });
            $scope.isDeleteMode = false;
            $scope.uncheckAll();
        };
        // delete single keypad
        $scope.delete = function (keypad) {
            Keypad.destroy(keypad.id);
        };

        // keypad test
        $scope.checkKeypads = function () {
            $scope.device = null;
            $http.get('/votecollector/device/').then(
                function (success) {
                    if (success.data.error) {
                        $scope.device = success.data.error;
                    }
                    else {
                        $scope.device = success.data.device;
                        if (success.data.connected) {
                            $http.get('/votecollector/start_ping/').then(
                                function (success) {
                                    if (success.data.error) {
                                        $scope.device = success.data.error;
                                    }
                                    else {
                                        // Stop pinging after 5 seconds.
                                        $timeout(function () {
                                            $http.get('/votecollector/stop/');
                                        }, 5000);
                                    }
                                }
                            );
                        }
                     }
                },
                function (failure) {
                    $scope.device = $scope.vc.getErrorMessage(failure.status, failure.statusText);
                }
            );
        };

        // Generate seating plan with empty seats
        $scope.seatingPlan = SeatingPlan.generate(Seat.getAll());

        $scope.changeSeat = function (seat, result) {
            seat.number = result;
            // Inject the changed seat object back into DS store.
            Seat.inject(seat);
            // Save change seat object on server.
            Seat.save(seat).then(
                function (success) {},
                function (error) {}
            );
        }

    }
])

.controller('KeypadCreateCtrl', [
    '$scope',
    'Keypad',
    'KeypadForm',
    function ($scope, Keypad, KeypadForm) {
        $scope.model = {};
        // get all form fields
        $scope.formFields = KeypadForm.getFormFields();

        // save keypad
        $scope.save = function (keypad) {
            Keypad.create(keypad).then(
                function (success) {
                    $scope.closeThisDialog();
                },
                function (error) {
                    var message = '';
                    for (var e in error.data) {
                        message += e + ': ' + error.data[e] + ' ';
                    }
                    $scope.alert = {type: 'danger', msg: message, show: true};
                }
            );
        };
    }
])

.controller('KeypadUpdateCtrl', [
    '$scope',
    'Keypad',
    'KeypadForm',
    'keypad',
    function ($scope, Keypad, KeypadForm, keypad) {
        $scope.alert = {};
        // set initial values for form model by create deep copy of keypad object
        // so list/detail view is not updated while editing
        $scope.model = angular.copy(keypad);

        // get all form fields
        $scope.formFields = KeypadForm.getFormFields();

        // save keypad
        $scope.save = function (keypad) {
            // inject the changed keypad (copy) object back into DS store
            Keypad.inject(keypad);
            // save change keypad object on server
            Keypad.save(keypad).then(
                function (success) {
                    $scope.closeThisDialog();
                },
                function (error) {
                    // save error: revert all changes by restore
                    // (refresh) original keypad object from server
                    Keypad.refresh(keypad);
                    var message = '';
                    for (var e in error.data) {
                        message += e + ': ' + error.data[e] + ' ';
                    }
                    $scope.alert = {type: 'danger', msg: message, show: true};
                }
            );
        };
    }
])

.controller('KeypadImportCtrl', [
    '$scope',
    '$http',
    'gettext',
    'Keypad',
    'User',
    'Seat',
    function ($scope, $http, gettext, Keypad, User, Seat) {

        $scope.users = [];
        $scope.separator = ',';
        $scope.encoding = 'UTF-8';
        $scope.encodingOptions = ['UTF-8', 'ISO-8859-1'];
        $scope.accept = '.csv, .txt';
        $scope.csv = {
            content: null,
            header: true,
            headerVisible: false,
            separator: $scope.separator,
            separatorVisible: false,
            encoding: $scope.encoding,
            encodingVisible: false,
            accept: $scope.accept,
            result: null
        };
        // set csv file encoding
        $scope.setEncoding = function () {
            $scope.csv.encoding = $scope.encoding;
        };
        // set csv file encoding
        $scope.setSeparator = function () {
            $scope.csv.separator = $scope.separator;
        };

        // detect if csv file is loaded
        $scope.$watch('csv.result', function () {
            $scope.users = [];
            var quotionRe = /^"(.*)"$/;
            angular.forEach($scope.csv.result, function (keypaduser) {
                // title
                if (keypaduser.title) {
                    keypaduser.title = keypaduser.title.replace(quotionRe, '$1');
                }
                // first name
                if (keypaduser.first_name) {
                    keypaduser.first_name = keypaduser.first_name.replace(quotionRe, '$1');
                }
                // last name
                if (keypaduser.last_name) {
                    keypaduser.last_name = keypaduser.last_name.replace(quotionRe, '$1');
                }
                if (!keypaduser.first_name && !keypaduser.last_name) {
                    keypaduser.importerror = true;
                    keypaduser.name_error = gettext('Error: First and last name is required.');
                }
                // structure level
                if (keypaduser.structure_level) {
                    keypaduser.structure_level = keypaduser.structure_level.replace(quotionRe, '$1');
                }
                // keypad id
                if (keypaduser.keypad_id) {
                    keypaduser.keypad_id = keypaduser.keypad_id.replace(quotionRe, '$1');
                }
                // seat label
                if (keypaduser.seat_label) {
                    keypaduser.seat_label = keypaduser.seat_label.replace(quotionRe, '$1');
                }
                keypaduser.fullname = [keypaduser.title, keypaduser.first_name, keypaduser.last_name, keypaduser.structure_level].join(' ');

                // check if keypaduser already exists
                angular.forEach(User.getAll(), function(user) {
                    user.fullname = [user.title, user.first_name, user.last_name, user.structure_level].join(' ');
                    if (user.fullname == keypaduser.fullname) {
                        keypaduser.user_id = user.id;
                    }
                });
                // check if seat label exists
                var seatFound = false;
                angular.forEach(Seat.getAll(), function(seat) {
                    if (seat.number == keypaduser.seat_label) {
                        // check if the seat id already assigned to a keypad
                        angular.forEach(Keypad.getAll(), function(keypad) {
                            if (keypad.seat_id == seat.id) {
                                keypaduser.importerror = true;
                                keypaduser.seat_error = gettext('Error: Seat ID already assigned to a keypad.');
                            }
                        });
                        keypaduser.seat_id = seat.id;
                        seatFound = true;
                    }
                });
                // seat label does not exists
                if (!seatFound) {
                    keypaduser.importerror = true;
                    keypaduser.seat_error = gettext('Error: Seat label does not exists.');
                }
                // check if keypad id already exists
                angular.forEach(Keypad.getAll(), function(keypad) {
                    if (keypad.keypad_id == keypaduser.keypad_id) {
                        keypaduser.importerror = true;
                        keypaduser.keypad_error = gettext('Error: Keypad ID already exists.');
                    }
                });
                // check if users exists
                if (!keypaduser.user_id) {
                    keypaduser.importerror = true;
                    keypaduser.name_error = gettext('Error: Participant not found.');
                }
                $scope.users.push(keypaduser);
            });
        });

        // import from csv file
        $scope.import = function () {
            $scope.csvImporting = true;
            angular.forEach($scope.users, function (user) {
                if (!user.importerror) {
                    var keypad = {
                        'keypad_id': user.keypad_id,
                        'user_id': user.user_id,
                        'seat_id': user.seat_id
                    }
                    Keypad.create(keypad).then(
                        function(success) {
                            user.imported = true;
                        }
                    );
                }
            });
            $scope.csvimported = true;
        };

        // clear csv import preview
        $scope.clear = function () {
            $scope.csv.result = null;
        };

    }
])

// Button at template hook motionPollSmallButtons
.run([
    'templateHooks',
    function (templateHooks) {
        templateHooks.registerHook({
            Id: 'motionPollSmallButtons',
            template: '<div class="spacer" ng-if="poll.has_votes">' +
                      '<a ui-sref="openslides_votecollector.motionpoll.detail({id: poll.id})">' +
                      '<button class="btn btn-xs btn-default">' +
                      '<i class="fa fa-table" aria-hidden="true"></i> ' +
                      '{{ \'Single votes\' | translate }}' +
                      '</button></a></div>'
        })
    }
])

.controller('MotionPollDetailCtrl', [
    '$scope',
    '$stateParams',
    '$http',
    'Keypad',
    'Projector',
    'User',
    'MotionPoll',
    'MotionPollFinder',
    'MotionPollKeypadConnection',
    'motions',
    function ($scope, $stateParams, $http, Keypad, Projector, User, MotionPoll, MotionPollFinder, MotionPollKeypadConnection, motions) {
        // Find motion and poll from URL parameter (via $stateparams).
        _.assign($scope, MotionPollFinder.find(motions, $stateParams.id));
        // Bind poll to scope for autoupdate of total vote result
        MotionPoll.bindOne($scope.poll.id, $scope, 'poll');

        $scope.$watch(
            function () {
                return MotionPollKeypadConnection.lastModified();
            },
            function () {
                // Create table for single votes
                $scope.votesList = [];
                angular.forEach(MotionPollKeypadConnection.getAll(), function(mpkc) {
                    if (mpkc.poll_id == $scope.poll.id) {
                        var keypad = null;
                        if (mpkc.keypad_id) {
                            keypad = Keypad.get(mpkc.keypad_id);
                            var user = null;
                            if (keypad.user_id) {
                                user = User.get(keypad.user_id);
                            }
                        }
                        $scope.votesList.push({
                            user: user,
                            keypad: keypad,
                            serial_number: mpkc.serial_number,
                            value: mpkc.value
                        });
                    }
                });
            }
        );

        $scope.isProjected = function (poll_id) {
            // Returns true if there is a projector element with the same
            // name and the same id of poll.
            var projector = Projector.get(1);
            var isProjected;
            if (typeof projector !== 'undefined') {
                var self = this;
                var predicate = function (element) {
                    return element.name == "votecollector/motionpoll" &&
                        typeof element.id !== 'undefined' &&
                        element.id == poll_id;
                };
                isProjected = typeof _.findKey(projector.elements, predicate) === 'string';
            } else {
                isProjected = false;
            }
            return isProjected;
        };

        $scope.projectSlide = function () {
            return $http.post(
                '/rest/core/projector/1/prune_elements/',
                [{name: 'votecollector/motionpoll', id: $scope.poll.id}]
            );
        };

        $scope.anonymizeVotes = function () {
            return $http.post(
                '/rest/openslides_votecollector/motionpollkeypadconnection/anonymize_votes/',
                {poll_id: $scope.poll.id}
            ).then(function (success) {}, function (error) {});
        };
    }
])

// Button at template hook assignmentPollSmallButtons
.run([
    'templateHooks',
    function (templateHooks) {
        templateHooks.registerHook({
            Id: 'assignmentPollSmallButtons',
            template: '<div class="spacer" ng-if="poll.has_votes">' +
                      '<a ui-sref="openslides_votecollector.assignmentpoll.detail({id: poll.id})">' +
                      '<button class="btn btn-sm btn-default">' +
                      '<i class="fa fa-table" aria-hidden="true"></i> ' +
                      '{{ \'Single votes\' | translate }}' +
                      '</button></a></div>'
        })
    }
])

.controller('AssignmentPollDetailCtrl', [
    '$scope',
    '$http',
    '$stateParams',
    'Keypad',
    'Projector',
    'User',
    'AssignmentPoll',
    'AssignmentPollFinder',
    'AssignmentPollKeypadConnection',
    'assignments',
    function ($scope, $http, $stateParams, Keypad, Projector, User, AssignmentPoll, AssignmentPollFinder, AssignmentPollKeypadConnection, assignments) {
        // Find assignment and poll from URL parameter (via $stateparams).
        _.assign($scope, AssignmentPollFinder.find(assignments, $stateParams.id));
        // Bind poll to scope for autoupdate of total vote result
        AssignmentPoll.bindOne($scope.poll.id, $scope, 'poll');

        $scope.$watch(
            function () {
                return AssignmentPollKeypadConnection.lastModified();
            },
            function () {
                // Create table for single votes
                $scope.votesList = [];
                angular.forEach(AssignmentPollKeypadConnection.getAll(), function (apkc) {
                    if (apkc.poll_id == $scope.poll.id) {
                        var keypad = null;
                        if (apkc.keypad_id) {
                            keypad = Keypad.get(apkc.keypad_id);
                            var user = null;
                            if (keypad.user_id) {
                                user = User.get(keypad.user_id);
                            }
                        }
                        var candidate = null;
                        if (apkc.candidate_id) {
                            candidate = User.get(apkc.candidate_id);
                        }
                        $scope.votesList.push({
                            user: user,
                            keypad: keypad,
                            serial_number: apkc.serial_number,
                            value: apkc.value,
                            candidate: candidate
                        });
                    }
                });
            }
        );

        $scope.isProjected = function (poll_id) {
            // Returns true if there is a projector element with the same
            // name and the same id of poll.
            var projector = Projector.get(1);
            var isProjected;
            if (typeof projector !== 'undefined') {
                var self = this;
                var predicate = function (element) {
                    return element.name == "votecollector/assignmentpoll" &&
                        typeof element.id !== 'undefined' &&
                        element.id == poll_id;
                };
                isProjected = typeof _.findKey(projector.elements, predicate) === 'string';
            } else {
                isProjected = false;
            }
            return isProjected;
        };

        $scope.projectSlide = function () {
            return $http.post(
                '/rest/core/projector/1/prune_elements/',
                [{name: 'votecollector/assignmentpoll', id: $scope.poll.id}]
            );
        };


        $scope.anonymizeVotes = function () {
            return $http.post(
                '/rest/openslides_votecollector/assignmentpollkeypadconnection/anonymize_votes/',
                {poll_id: $scope.poll.id}
            ).then(function (success) {}, function (error) {});
        };
    }
])

.controller('VotingCtrl', [
    '$scope',
    '$http',
    'gettextCatalog',
    'Projector',
    'VoteCollector',
    function ($scope, $http,  gettextCatalog, Projector, VoteCollector) {
        VoteCollector.find(1);
        VoteCollector.bindOne(1, $scope, 'vc');

        $scope.canStartVoting = function () {
            return $scope.vc !== undefined && (!$scope.vc.is_voting || $scope.vc.voting_mode == 'Item');
        };

        $scope.canStopVoting = function () {
            return $scope.vc !== undefined && $scope.vc.is_voting && $scope.vc.voting_mode == 'MotionPoll' &&
                $scope.vc.voting_target == $scope.poll.id;
        };

        $scope.startVoting = function () {
            $scope.$parent.$parent.$parent.alert = {};
            // Clear votes, clearing form inputs.
            $scope.poll.yes = null;
            $scope.poll.no = null;
            $scope.poll.abstain = null;
            $scope.poll.votesvalid = null;
            $scope.poll.votesinvalid = null;
            $scope.poll.votescast = null;
            $http.get('/votecollector/start_yna/' + $scope.poll.id + '/').then(
                function (success) {
                    if (success.data.error) {
                        $scope.$parent.$parent.$parent.alert = { type: 'danger', msg: success.data.error, show: true };
                    }
                },
                function (failure) {
                    $scope.$parent.$parent.$parent.alert = {
                        type: 'danger',
                        msg: $scope.vc.getErrorMessage(failure.status, failure.statusText),
                        show: true };
                }
            );
        };

        $scope.stopVoting = function () {
            // TODO: Clear seating plan (MotionPollKeypadConnections) if results are not saved after stop voting.
            $scope.$parent.$parent.$parent.alert = {};
            $http.get('/votecollector/stop/').then(
                function (success) {
                    if (success.data.error) {
                        $scope.$parent.$parent.$parent.alert = { type: 'danger',
                            msg: success.data.error, show: true };
                    }
                    else {
                        $http.get('/votecollector/result_yna/' + $scope.poll.id + '/').then(
                            function (success) {
                                if (success.data.error) {
                                    $scope.$parent.$parent.$parent.alert = { type: 'danger',
                                        msg: success.data.error, show: true };
                                }
                                else {
                                    // Store result in DS model; updates form inputs.
                                    $scope.poll.yes = success.data.votes[0];
                                    $scope.poll.no = success.data.votes[1];
                                    $scope.poll.abstain = success.data.votes[2];
                                    $scope.poll.votesvalid = $scope.vc.votes_received;
                                    $scope.poll.votesinvalid = 0;
                                    $scope.poll.votescast = $scope.vc.votes_received;

                                    // Prompt user to save result.
                                    $scope.$parent.$parent.$parent.alert = {
                                        type: 'info',
                                        msg: gettextCatalog.getString('Motion voting has finished.') + ' ' +
                                             gettextCatalog.getString('Received votes:') + ' ' +
                                             $scope.vc.votes_received + ' / ' + $scope.vc.voters_count + '. ' +
                                             gettextCatalog.getString('Save this result now!'),
                                        show: true
                                    };
                                }
                            }
                        );
                    }
                },
                function (failure) {
                    $scope.$parent.$parent.$parent.alert = {
                        type: 'danger',
                        msg: $scope.vc.getErrorMessage(failure.status, failure.statusText),
                        show: true };
                }
            );
        };

        $scope.getVotingStatus = function () {
            if ($scope.vc !== undefined) {
                if ($scope.vc.is_voting && $scope.vc.voting_mode == 'Test') {
                    return gettextCatalog.getString('System test is running.');
                }
                if ($scope.vc.is_voting && $scope.vc.voting_mode == 'Item') {
                    return gettextCatalog.getString('Speakers voting is running for agenda item') + ' ' +
                        $scope.vc.voting_target + '.';
                }
                if ($scope.vc.is_voting && $scope.vc.voting_mode == 'AssignmentPoll') {
                    return gettextCatalog.getString('An election is running.');
                }
                if ($scope.vc.is_voting && $scope.vc.voting_mode == 'MotionPoll') {
                    if ($scope.vc.voting_target != $scope.poll.id) {
                        return gettextCatalog.getString('Another motion voting is running.');
                    }
                    return gettextCatalog.getString('Votes received:') + ' ' +
                        // TODO: Add voting duration.
                        $scope.vc.votes_received + ' / ' + $scope.vc.voters_count;
                }
            }
            return '';
        };

        $scope.projectSlide = function () {
            return $http.post(
                '/rest/core/projector/1/prune_elements/',
                [{name: 'votecollector/motionpoll', id: $scope.poll.id}]
            );
        };

        $scope.isProjected = function () {
            // Returns true if there is a projector element with the same
            // name and the same id of $scope.poll.
            var projector = Projector.get(1);
            var isProjected;
            if (typeof projector !== 'undefined') {
                var self = this;
                var predicate = function (element) {
                    return element.name == "votecollector/motionpoll" &&
                        typeof element.id !== 'undefined' &&
                        element.id == $scope.poll.id;
                };
                isProjected = typeof _.findKey(projector.elements, predicate) === 'string';
            } else {
                isProjected = false;
            }
            return isProjected;
        }
    }
])

.controller('ElectionCtrl', [
    '$scope',
    '$http',
    'gettextCatalog',
    'Config',
    'Projector',
    'VoteCollector',
    function ($scope, $http, gettextCatalog, Config, Projector, VoteCollector) {
        VoteCollector.find(1);
        VoteCollector.bindOne(1, $scope, 'vc');

        $scope.canStartVoting = function () {
            var electionMethod = Config.get('assignments_poll_vote_values').value,
                enabled = $scope.poll.assignment.open_posts == 1 && (
                    electionMethod == 'auto' || electionMethod == 'votes');
            return enabled && $scope.vc !== undefined && (!$scope.vc.is_voting || $scope.vc.voting_mode == 'Item');
        };

        $scope.canStopVoting = function () {
            return $scope.vc !== undefined && $scope.vc.is_voting && $scope.vc.voting_mode == 'AssignmentPoll' &&
                $scope.vc.voting_target == $scope.poll.id;
        };

        $scope.startVoting = function () {
            $scope.$parent.$parent.$parent.alert = {};
            // Clear votes, clearing form inputs.
            if ($scope.poll.yesnoabstain) {
                $scope.poll.yes = null;
                $scope.poll.no = null;
                $scope.poll.abstain = null;
            }
            else {
                for (var i = 0; i < $scope.poll.options.length; i++) {
                    $scope.poll['vote_' + $scope.poll.options[i].candidate_id] = null;
                }
            }
            $scope.poll.votesvalid = null;
            $scope.poll.votesinvalid = null;
            $scope.poll.votescast = null;

            // Start votecollector.
            // Unlock all keys including 0: 10
            var url = '/votecollector/start_election/' + $scope.poll.id + '/10/';
            if ($scope.poll.yesnoabstain) {
                url = '/votecollector/start_election_one/' + $scope.poll.id + '/';
            }
            $http.get(url).then(
                function (success) {
                    if (success.data.error) {
                        $scope.$parent.$parent.$parent.alert = { type: 'danger', msg: success.data.error, show: true };
                    }
                },
                function (failure) {
                    $scope.$parent.$parent.$parent.alert = {
                        type: 'danger',
                        msg: $scope.vc.getErrorMessage(failure.status, failure.statusText),
                        show: true };
                }
            );
        };

        $scope.stopVoting = function () {
            $scope.$parent.$parent.$parent.alert = {};

            // Stop votecollector.
            $http.get('/votecollector/stop/').then(
                function (success) {
                    if (success.data.error) {
                        $scope.$parent.$parent.$parent.alert = { type: 'danger',
                            msg: success.data.error, show: true };
                    }
                    else {
                        // Get votecollector result.
                        $http.get('/votecollector/result_election/' + $scope.poll.id + '/').then(
                            function (success) {
                                if (success.data.error) {
                                    $scope.$parent.$parent.$parent.alert = { type: 'danger',
                                        msg: success.data.error, show: true };
                                }
                                else {
                                    // Store result in DS model, updates form inputs.
                                    if ($scope.poll.yesnoabstain) {
                                        var id = $scope.poll.options[0].candidate_id;
                                        $scope.poll['yes_' + id] = success.data.votes[0];
                                        $scope.poll['no_' + id] = success.data.votes[1];
                                        $scope.poll['abstain_' + id] = success.data.votes[2];
                                        $scope.poll.votesvalid = $scope.vc.votes_received;
                                        $scope.poll.votesinvalid = 0;
                                    }
                                    else {
                                        var key;
                                        for (var i = 0; i < $scope.poll.options.length; i++) {
                                            key = 'vote_' + $scope.poll.options[i].candidate_id;
                                            $scope.poll[key] = success.data.votes[key];
                                        }
                                        $scope.poll.votesvalid = success.data.votes['valid'];
                                        $scope.poll.votesinvalid = success.data.votes['invalid'];
                                    }
                                   $scope.poll.votescast = $scope.vc.votes_received;

                                    // Prompt user to save result.
                                    $scope.$parent.$parent.$parent.alert = {
                                        type: 'info',
                                        msg: gettextCatalog.getString('Election voting has finished.') + ' ' +
                                             gettextCatalog.getString('Received votes:') + ' ' +
                                             $scope.vc.votes_received + ' / ' + $scope.vc.voters_count + '. ' +
                                             gettextCatalog.getString('Save this result now!'),
                                        show: true
                                    };
                                }
                            }
                        );
                    }
                },
                function (failure) {
                    $scope.$parent.$parent.$parent.alert = {
                        type: 'danger',
                        msg: $scope.vc.getErrorMessage(failure.status, failure.statusText),
                        show: true };
                }
            );
        };

        $scope.getVotingStatus = function () {
            if ($scope.vc !== undefined) {
                if ($scope.vc.is_voting && $scope.vc.voting_mode == 'Test') {
                    return gettextCatalog.getString('System test is running.');
                }
                if ($scope.vc.is_voting && $scope.vc.voting_mode == 'Item') {
                    return gettextCatalog.getString('Speakers voting is running for agenda item') + ' ' +
                        $scope.vc.voting_target + '.';
                }
                if ($scope.vc.is_voting && $scope.vc.voting_mode == 'MotionPoll') {
                    return gettextCatalog.getString('A motion voting is running.');
                }
                if ($scope.vc.is_voting && $scope.vc.voting_mode == 'AssignmentPoll') {
                    if ($scope.vc.voting_target != $scope.poll.id) {
                        return gettextCatalog.getString('Another election is running.');
                    }
                    return gettextCatalog.getString('Votes received:') + ' ' +
                        // TODO: Add voting duration.
                        $scope.vc.votes_received + ' / ' + $scope.vc.voters_count;
                }
            }
            return '';
        };

        $scope.projectSlide = function () {
            return $http.post(
                '/rest/core/projector/1/prune_elements/',
                [{name: 'votecollector/assignmentpoll', id: $scope.poll.id}]
            );
        };

        $scope.isProjected = function (poll_id) {
            // Returns true if there is a projector element with the same
            // name and the same id of $scope.poll.
            var projector = Projector.get(1);
            var isProjected;
            if (typeof projector !== 'undefined') {
                var self = this;
                var predicate = function (element) {
                    return element.name == "votecollector/assignmentpoll" &&
                        typeof element.id !== 'undefined' &&
                        element.id == poll_id;
                };
                isProjected = typeof _.findKey(projector.elements, predicate) === 'string';
            } else {
                isProjected = false;
            }
            return isProjected;
        }
    }
])

.controller('SpeakerListCtrl', [
    '$scope',
    '$http',
    'VoteCollector',
    function ($scope, $http, VoteCollector) {
        VoteCollector.find(1);
        VoteCollector.bindOne(1, $scope, 'vc');

        $scope.canStartVoting = function () {
            return $scope.vc !== undefined && (!$scope.vc.is_voting || (
                $scope.vc.voting_mode == 'Item' && $scope.vc.voting_target != $scope.item.id));
        };

        $scope.canStopVoting = function () {
            return $scope.vc !== undefined && $scope.vc.is_voting && $scope.vc.voting_mode == 'Item' &&
                $scope.vc.voting_target == $scope.item.id;
        };

        $scope.startVoting = function () {
            $scope.vcAlert = {};
            $http.get('/votecollector/start_speaker_list/' + $scope.item.id + '/').then(
                function (success) {
                    if (success.data.error) {
                        $scope.vcAlert = { type: 'danger', msg: success.data.error, show: true };
                    }
                },
                function (failure) {
                    $scope.vcAlert = {
                        type: 'danger',
                        msg: $scope.vc.getErrorMessage(failure.status, failure.statusText),
                        show: true };
                }
            );
        };

        $scope.stopVoting = function () {
            $scope.vcAlert = {};
            $http.get('/votecollector/stop/').then(
                function (success) {
                    if (success.data.error) {
                        $scope.vcAlert = { type: 'danger', msg: success.data.error, show: true };
                    }
                },
                function (failure) {
                    $scope.vcAlert = {
                        type: 'danger',
                        msg: $scope.vc.getErrorMessage(failure.status, failure.statusText),
                        show: true };
                }
            );
        };
    }
])

// VotingCtrl at template hook motionPollFormButtons
.run([
    'templateHooks',
    function (templateHooks) {
        templateHooks.registerHook({
            Id: 'motionPollFormButtons',
            template:
                '<div ng-controller="VotingCtrl" ng-init="poll=$parent.$parent.model" class="spacer">' +
                    '<button type="button" ng-if="canStartVoting()" ' +
                        'ng-click="startVoting()"' +
                        'class="btn btn-default">' +
                        '<i class="fa fa-wifi" aria-hidden="true"></i> ' +
                        '{{ \'Start voting\' | translate }}</button> ' +
                    '<button type="button" ng-if="canStopVoting()" ' +
                        'ng-click="stopVoting()"' +
                        'class="btn btn-primary">' +
                        '<i class="fa fa-wifi" aria-hidden="true"></i> '+
                        '{{ \'Stop voting\' | translate }}</button> ' +
                    '<button type="button" os-perms="core.can_manage_projector" class="btn btn-default"' +
                      ' ng-class="{ \'btn-primary\': isProjected() }"' +
                      ' ng-click="projectSlide()"' +
                      ' title="{{ \'Project vote result\' | translate }}">' +
                      '<i class="fa fa-video-camera"></i> ' +
                      '{{ \'Voting result\' | translate }}</button>' +
                    '<p>{{ getVotingStatus() }}</p>' +
                '</div>'
        })
    }
])

// ElectionCtrl at template hook assignmentPollFormButtons
.run([
    'templateHooks',
    function (templateHooks) {
        templateHooks.registerHook({
            Id: 'assignmentPollFormButtons',
            template:
                '<div ng-controller="ElectionCtrl" ng-init="poll=$parent.$parent.model" class="spacer">' +
                    '<button type="button" ng-if="canStartVoting()" ' +
                        'ng-click="startVoting()"' +
                        'class="btn btn-default">' +
                        '<i class="fa fa-wifi" aria-hidden="true"></i> '+
                        '{{ \'Start election\' | translate }}</button> ' +
                    '<button type="button" ng-if="canStopVoting()" ' +
                        'ng-click="stopVoting()"' +
                        'class="btn btn-primary">' +
                        '<i class="fa fa-wifi" aria-hidden="true"></i> '+
                        '{{ \'Stop election\' | translate }}</button> ' +
                    '<button type="button" os-perms="core.can_manage_projector" class="btn btn-default"' +
                      ' ng-class="{ \'btn-primary\': isProjected(poll.id) }"' +
                      ' ng-click="projectSlide()"' +
                      ' title="{{ \'Project election result\' | translate }}">' +
                      '<i class="fa fa-video-camera"></i> ' +
                      '{{ \'Election result\' | translate }}</button>' +
                    '<p>{{ getVotingStatus() }}</p>' +
                '</div>'
        })
    }
])

// SpeakerListCtrl at template hook itemDetailListOfSpeakersButtons
.run([
    'gettextCatalog',
    'templateHooks',
    function (gettextCatalog, templateHooks) {
        templateHooks.registerHook({
            Id: 'itemDetailListOfSpeakersButtons',
            template:
                '<div ng-controller="SpeakerListCtrl" ng-init="item=$parent.$parent.item" class="spacer">' +
                    '<button ng-if="canStartVoting()" ' +
                        'ng-click="startVoting()"' +
                        'class="btn btn-sm btn-default">' +
                        '<i class="fa fa-wifi" aria-hidden="true"></i> '+
                        '{{ \'Start speakers voting\' | translate }}</button> ' +
                    '<button ng-if="canStopVoting()" ' +
                        'ng-click="stopVoting()"' +
                        'class="btn btn-sm btn-primary">' +
                        '<i class="fa fa-wifi" aria-hidden="true"></i> '+
                        '{{ \'Stop speakers voting\' | translate }}</button> ' +
                    '<uib-alert ng-show="vcAlert.show" type="{{ vcAlert.type }}" ng-click="vcAlert={}" close="vcAlert={}">' +
                        '{{ vcAlert.msg }}</uib-alert>' +
                '</div>'
        })
    }
])

// Mark config strings for translation in javascript
.config([
    'gettext',
    function (gettext) {
        // config stings
        gettext('Distribution method for keypads');
        gettext('Use anonymous keypads only');
        gettext('Use personalized keypads only');
        gettext('Use anonymous and personalized keypads');
        gettext('URL of VoteCollector');
        gettext('Example: http://localhost:8030');
        gettext("Overlay message 'Vote started'");
        gettext('Please vote now!');
        gettext('Use live voting for motions');
        gettext('Incoming votes will be shown on projector while voting is active.');
        gettext('Show seating plan');
        gettext('Incoming votes will be shown in seating plan on projector for keypads with assigned seats.');
        gettext('Show grey seats on seating plan');
        gettext('Incoming votes will be shown in grey on seating plan. You can see only WHICH seat has voted but not HOW.');

        // template hook strings
        gettext('Start voting');
        gettext('Stop voting');
        gettext('Start election');
        gettext('Stop election');
        gettext('Start speakers voting');
        gettext('Stop speakers voting');
        gettext('Single votes');
        gettext('Voting result');
        gettext('Project vote result');
        gettext('Election result');
        gettext('Project election result');

        // permission strings
        gettext('Can manage VoteCollector');
    }
])

}());
