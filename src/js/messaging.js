/*******************************************************************************

    µBlock - a Chromium browser extension to block requests.
    Copyright (C) 2014 Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/uBlock
*/

/* global µBlock, vAPI, YaMD5 */

/******************************************************************************/
/******************************************************************************/

// Default handler

(function() {

'use strict';

/******************************************************************************/

var onMessage = function(request, sender, callback) {
    var µb = µBlock;

    // Async
    switch ( request.what ) {
        case 'getAssetContent':
            // https://github.com/gorhill/uBlock/issues/417
            µb.assets.get(request.url, callback);
            return;

        default:
            break;
    }

    // Sync
    var response;

    switch ( request.what ) {
        case 'contextMenuEvent':
            µb.contextMenuClientX = request.clientX;
            µb.contextMenuClientY = request.clientY;
            break;

        case 'getAppData':
            response = vAPI.app;
            break;

        case 'getUserSettings':
            response = µb.userSettings;
            break;

        case 'gotoURL':
            vAPI.tabs.open(request.details);
            break;

        case 'reloadAllFilters':
            µb.reloadPresetBlacklists(request.switches, request.update);
            break;

        case 'reloadTab':
            vAPI.tabs.reload(request.tabId);
            break;

        case 'userSettings':
            response = µb.changeUserSettings(request.name, request.value);
            break;

        default:
            return vAPI.messaging.UNHANDLED;
    }

    callback(response);
};

vAPI.messaging.setup(onMessage);

/******************************************************************************/

})();

/******************************************************************************/
/******************************************************************************/

// popup.js

(function() {

'use strict';

/******************************************************************************/

var µb = µBlock;

/******************************************************************************/

var getHostnameDict = function(hostnameToCountMap) {
    var r = {};
    var µburi = µb.URI;
    var domain, counts;
    for ( var hostname in hostnameToCountMap ) {
        if ( hostnameToCountMap.hasOwnProperty(hostname) === false ) {
            continue;
        }
        if ( r.hasOwnProperty(hostname) ) {
            continue;
        }
        domain = µburi.domainFromHostname(hostname);
        counts = hostnameToCountMap[domain] || 0;
        r[domain] = {
            domain: domain,
            blockCount: counts & 0xFFFF,
            allowCount: counts >>> 16 & 0xFFFF
        };
        if ( hostname === domain ) {
            continue;
        }
        counts = hostnameToCountMap[hostname] || 0;
        r[hostname] = {
            domain: domain,
            blockCount: counts & 0xFFFF,
            allowCount: counts >>> 16 & 0xFFFF
        };
    }
    return r;
};

/******************************************************************************/

var getDynamicFilterRules = function(srcHostname, desHostnames) {
    var r = {};
    var dFiltering = µb.dynamicNetFilteringEngine;
    r['/ * image'] = dFiltering.evaluateCellZY('*', '*', 'image').toFilterString();
    r['/ * inline-script'] = dFiltering.evaluateCellZY('*', '*', 'inline-script').toFilterString();
    r['/ * 1p-script'] = dFiltering.evaluateCellZY('*', '*', '1p-script').toFilterString();
    r['/ * 3p-script'] = dFiltering.evaluateCellZY('*', '*', '3p-script').toFilterString();
    r['/ * 3p-frame'] = dFiltering.evaluateCellZY('*', '*', '3p-frame').toFilterString();
    if ( typeof srcHostname !== 'string' ) {
        return r;
    }

    r['. * image'] = dFiltering.evaluateCellZY(srcHostname, '*', 'image').toFilterString();
    r['. * inline-script'] = dFiltering.evaluateCellZY(srcHostname, '*', 'inline-script').toFilterString();
    r['. * 1p-script'] = dFiltering.evaluateCellZY(srcHostname, '*', '1p-script').toFilterString();
    r['. * 3p-script'] = dFiltering.evaluateCellZY(srcHostname, '*', '3p-script').toFilterString();
    r['. * 3p-frame'] = dFiltering.evaluateCellZY(srcHostname, '*', '3p-frame').toFilterString();

    for ( var desHostname in desHostnames ) {
        if ( desHostnames.hasOwnProperty(desHostname) ) {
            r['/ ' + desHostname + ' *'] = dFiltering.evaluateCellZY('*', desHostname, '*').toFilterString();
            r['. ' + desHostname + ' *'] = dFiltering.evaluateCellZY(srcHostname, desHostname, '*').toFilterString();
        }
    }
    return r;
};

/******************************************************************************/

var getStats = function(tabId) {
    var r = {
        advancedUserEnabled: µb.userSettings.advancedUserEnabled,
        appName: vAPI.app.name,
        appVersion: vAPI.app.version,
        cosmeticFilteringSwitch: false,
        dfEnabled: µb.userSettings.dynamicFilteringEnabled,
        globalAllowedRequestCount: µb.localSettings.allowedRequestCount,
        globalBlockedRequestCount: µb.localSettings.blockedRequestCount,
        netFilteringSwitch: false,
        pageURL: '',
        pageAllowedRequestCount: 0,
        pageBlockedRequestCount: 0,
        tabId: tabId
    };
    var pageStore = µb.pageStoreFromTabId(tabId);
    if ( pageStore ) {
        r.pageURL = pageStore.pageURL;
        r.pageDomain = pageStore.pageDomain;
        r.pageHostname = pageStore.pageHostname;
        r.pageBlockedRequestCount = pageStore.perLoadBlockedRequestCount;
        r.pageAllowedRequestCount = pageStore.perLoadAllowedRequestCount;
        r.netFilteringSwitch = pageStore.getNetFilteringSwitch();
        r.hostnameDict = getHostnameDict(pageStore.hostnameToCountMap);
        r.dynamicFilterRules = getDynamicFilterRules(pageStore.pageHostname, r.hostnameDict);
    } else {
        r.hostnameDict = {};
        r.dynamicFilterRules = getDynamicFilterRules();
    }
    return r;
};

/******************************************************************************/

var onMessage = function(request, sender, callback) {
    // Async
    switch ( request.what ) {
        case 'activeTabStats':
            vAPI.tabs.get(null, function(tab) {
                var tabId = tab && tab.id;
                callback(getStats(tabId));
            });
            return;

        default:
            break;
    }

    // Sync
    var response;

    switch ( request.what ) {
        case 'gotoPick':
            // Picker launched from popup: clear context menu args
            µb.contextMenuClientX = -1;
            µb.contextMenuClientY = -1;
            µb.elementPickerExec(request.tabId);
            break;

        case 'toggleNetFiltering':
            µb.toggleNetFilteringSwitch(
                request.url,
                request.scope,
                request.state
            );
            µb.updateBadgeAsync(request.tabId);
            break;

        case 'toggleDynamicFilter':
            µb.toggleDynamicFilter(request);
            response = getStats(request.tabId);
            break;

        default:
            return vAPI.messaging.UNHANDLED;
    }

    callback(response);
};

vAPI.messaging.listen('popup.js', onMessage);

/******************************************************************************/

})();

/******************************************************************************/
/******************************************************************************/

// contentscript-start.js

(function() {

'use strict';

/******************************************************************************/

var µb = µBlock;

/******************************************************************************/

var onMessage = function(request, sender, callback) {
    // Async
    switch ( request.what ) {
        default:
            break;
    }

    // Sync
    var response;

    var pageStore;
    if ( sender && sender.tab ) {
        pageStore = µb.pageStoreFromTabId(sender.tab.id);
    }

    switch ( request.what ) {
        case 'retrieveDomainCosmeticSelectors':
            if ( pageStore && pageStore.getNetFilteringSwitch() ) {
                response = µb.cosmeticFilteringEngine.retrieveDomainSelectors(request);
            }
            break;

        default:
            return vAPI.messaging.UNHANDLED;
    }

    callback(response);
};

vAPI.messaging.listen('contentscript-start.js', onMessage);

/******************************************************************************/

})();

/******************************************************************************/
/******************************************************************************/

// contentscript-end.js

(function() {

'use strict';

/******************************************************************************/

var µb = µBlock;

/******************************************************************************/

var tagNameToRequestTypeMap = {
     'embed': 'object',
    'iframe': 'sub_frame',
       'img': 'image',
    'object': 'object'
};

/******************************************************************************/

// Evaluate many requests

var filterRequests = function(pageStore, details) {
    var µburi = µb.URI;

    // Create evaluation context
    details.pageDomain = µburi.domainFromHostname(details.pageHostname);
    details.rootHostname = pageStore.rootHostname;
    details.rootDomain = pageStore.rootDomain;
    details.requestHostname = '';

    var inRequests = details.requests;
    var outRequests = [];
    var request, result;
    var i = inRequests.length;
    while ( i-- ) {
        request = inRequests[i];
        if ( tagNameToRequestTypeMap.hasOwnProperty(request.tagName) === false ) {
            continue;
        }
        details.requestURL = request.url;
        details.requestHostname = µburi.hostnameFromURI(request.url);
        details.requestType = tagNameToRequestTypeMap[request.tagName];
        result = pageStore.filterRequest(details);
        if ( pageStore.boolFromResult(result) ) {
            outRequests.push(request);
        }
    }
    return {
        collapse: µb.userSettings.collapseBlocked,
        requests: outRequests
    };
};

/******************************************************************************/

// Evaluate a single request

var filterRequest = function(pageStore, details) {
    if ( tagNameToRequestTypeMap.hasOwnProperty(details.tagName) === false ) {
        return;
    }
    var µburi = µb.URI;
    details.pageDomain = µburi.domainFromHostname(details.pageHostname);
    details.rootHostname = pageStore.rootHostname;
    details.rootDomain = pageStore.rootDomain;
    details.requestHostname = µburi.hostnameFromURI(details.requestURL);
    details.requestType = tagNameToRequestTypeMap[details.tagName];
    var result = pageStore.filterRequest(details);
    if ( pageStore.boolFromResult(result) ) {
        return { collapse: µb.userSettings.collapseBlocked };
    }
};

/******************************************************************************/

var onMessage = function(details, sender, callback) {
    // Async
    switch ( details.what ) {
        default:
            break;
    }

    // Sync
    var response;

    var pageStore;
    if ( sender && sender.tab ) {
        pageStore = µb.pageStoreFromTabId(sender.tab.id);
    }

    switch ( details.what ) {
        case 'retrieveGenericCosmeticSelectors':
            if ( pageStore && pageStore.getNetFilteringSwitch() ) {
                response = µb.cosmeticFilteringEngine.retrieveGenericSelectors(details);
            }
            break;

        case 'injectedSelectors':
            µb.cosmeticFilteringEngine.addToSelectorCache(details);
            break;

        // Evaluate many requests
        case 'filterRequests':
            if ( pageStore && pageStore.getNetFilteringSwitch() ) {
                response = filterRequests(pageStore, details);
            }
            break;

        // Evaluate a single request
        case 'filterRequest':
            if ( pageStore && pageStore.getNetFilteringSwitch() ) {
                response = filterRequest(pageStore, details);
            }
            break;

        default:
            return vAPI.messaging.UNHANDLED;
    }

    callback(response);
};

vAPI.messaging.listen('contentscript-end.js', onMessage);

/******************************************************************************/

})();

/******************************************************************************/
/******************************************************************************/

// element-picker.js

(function() {

'use strict';

/******************************************************************************/

var µb = µBlock;

/******************************************************************************/

var onMessage = function(request, sender, callback) {
    // Async
    switch ( request.what ) {
        default:
            break;
    }

    // Sync
    var response;

    switch ( request.what ) {
        case 'elementPickerArguments':
            response = {
                i18n: {
                    '@@bidi_dir': document.body.getAttribute('dir'),
                    create: vAPI.i18n('pickerCreate'),
                    pick: vAPI.i18n('pickerPick'),
                    quit: vAPI.i18n('pickerQuit'),
                    netFilters: vAPI.i18n('pickerNetFilters'),
                    cosmeticFilters: vAPI.i18n('pickerCosmeticFilters'),
                    cosmeticFiltersHint: vAPI.i18n('pickerCosmeticFiltersHint')
                },
                target: µb.contextMenuTarget,
                clientX: µb.contextMenuClientX,
                clientY: µb.contextMenuClientY
            };
            µb.contextMenuTarget = '';
            µb.contextMenuClientX = -1;
            µb.contextMenuClientY = -1;
            break;

        case 'createUserFilter':
            µb.appendUserFilters(request.filters);
            break;

        default:
            return vAPI.messaging.UNHANDLED;
    }

    callback(response);
};

vAPI.messaging.listen('element-picker.js', onMessage);

/******************************************************************************/

})();

/******************************************************************************/
/******************************************************************************/

// 3p-filters.js

(function() {

'use strict';

/******************************************************************************/

var µb = µBlock;

/******************************************************************************/

var prepEntries = function(entries) {
    var µburi = µb.URI;
    var entry;
    for ( var k in entries ) {
        if ( entries.hasOwnProperty(k) === false ) {
            continue;
        }
        entry = entries[k];
        if ( typeof entry.homeURL === 'string' ) {
            entry.homeHostname = µburi.hostnameFromURI(entry.homeURL);
            entry.homeDomain = µburi.domainFromHostname(entry.homeHostname);
        }
    }
};

/******************************************************************************/

var getLists = function(callback) {
    var r = {
        available: null,
        current: µb.remoteBlacklists,
        cosmetic: µb.userSettings.parseAllABPHideFilters,
        netFilterCount: µb.staticNetFilteringEngine.getFilterCount(),
        cosmeticFilterCount: µb.cosmeticFilteringEngine.getFilterCount(),
        autoUpdate: µb.userSettings.autoUpdate,
        userFiltersPath: µb.userFiltersPath,
        cache: null
    };
    var onMetadataReady = function(entries) {
        r.cache = entries;
        prepEntries(r.cache);
        callback(r);
    };
    var onLists = function(lists) {
        r.available = lists;
        prepEntries(r.available);
        µb.assets.metadata(onMetadataReady);
    };
    µb.getAvailableLists(onLists);
};

/******************************************************************************/

var onMessage = function(request, sender, callback) {
    // Async
    switch ( request.what ) {
        case 'getLists':
            return getLists(callback);

        case 'purgeAllCaches':
            return µb.assets.purgeAll(callback);

        case 'writeUserUbiquitousBlockRules':
            return µb.assets.put(µb.userFiltersPath, request.content, callback);

        default:
            break;
    }

    // Sync
    var response;

    switch ( request.what ) {
        case 'purgeCache':
            µb.assets.purge(request.path);
            break;

        default:
            return vAPI.messaging.UNHANDLED;
    }

    callback(response);
};

vAPI.messaging.listen('3p-filters.js', onMessage);

/******************************************************************************/

})();

/******************************************************************************/
/******************************************************************************/

// 1p-filters.js

(function() {

'use strict';

/******************************************************************************/

var µb = µBlock;

/******************************************************************************/

var onMessage = function(request, sender, callback) {
    // Async
    switch ( request.what ) {
        case 'readUserFilters':
            return µb.assets.get(µb.userFiltersPath, callback);

        case 'writeUserFilters':
            return µb.assets.put(µb.userFiltersPath, request.content, callback);

        default:
            break;
    }

    // Sync
    var response;

    switch ( request.what ) {
        default:
            return vAPI.messaging.UNHANDLED;
    }

    callback(response);
};

vAPI.messaging.listen('1p-filters.js', onMessage);

/******************************************************************************/

})();

/******************************************************************************/
/******************************************************************************/

// dyna-rules.js

(function() {

'use strict';

/******************************************************************************/

var µb = µBlock;

/******************************************************************************/

var onMessage = function(request, sender, callback) {
    // Async
    switch ( request.what ) {
        default:
            break;
    }

    // Sync
    var response;

    switch ( request.what ) {
        case 'getDynamicRules':
            response = µb.dynamicNetFilteringEngine.toString();
            break;

        case 'setDynamicRules':
            µb.dynamicNetFilteringEngine.fromString(request.rawRules);
            µb.saveDynamicRules();
            response = µb.dynamicNetFilteringEngine.toString();
            break;

        default:
            return vAPI.messaging.UNHANDLED;
    }

    callback(response);
};

vAPI.messaging.listen('dyna-rules.js', onMessage);

/******************************************************************************/

})();

/******************************************************************************/
/******************************************************************************/

// whitelist.js

(function() {

'use strict';

/******************************************************************************/

var µb = µBlock;

/******************************************************************************/

var onMessage = function(request, sender, callback) {
    // Async
    switch ( request.what ) {
        default:
            break;
    }

    // Sync
    var response;

    switch ( request.what ) {
        case 'getWhitelist':
            response = µb.stringFromWhitelist(µb.netWhitelist);
            break;

        case 'setWhitelist':
            µb.netWhitelist = µb.whitelistFromString(request.whitelist);
            µb.saveWhitelist();
            break;

        default:
            return vAPI.messaging.UNHANDLED;
    }

    callback(response);
};

vAPI.messaging.listen('whitelist.js', onMessage);

/******************************************************************************/

})();

/******************************************************************************/
/******************************************************************************/

// stats.js

(function() {

'use strict';

/******************************************************************************/

var µb = µBlock;

/******************************************************************************/

var getPageDetails = function(callback) {
    var out = {};
    var tabIds = Object.keys(µb.pageStores);

    var countdown = tabIds.length;
    if ( countdown === 0 ) {
        callback(out);
        return;
    }

    var onTabDetails = function(tab) {
        if ( tab ) {
            out[tab.id] = tab.title;
        }
        countdown -= 1;
        if ( countdown === 0 ) {
            callback(out);
        }
    };

    var i = countdown;
    while ( i-- ) {
        vAPI.tabs.get(tabIds[i], onTabDetails);
    }
};

/******************************************************************************/

var onMessage = function(request, sender, callback) {
    // Async
    switch ( request.what ) {
        case 'getPageDetails':
            getPageDetails(callback);
            return;

        default:
            break;
    }

    // Sync
    var response;

    switch ( request.what ) {
        default:
            return vAPI.messaging.UNHANDLED;
    }

    callback(response);
};

vAPI.messaging.listen('stats.js', onMessage);

/******************************************************************************/

})();

/******************************************************************************/
/******************************************************************************/

// settings.js

(function() {

'use strict';

/******************************************************************************/

var µb = µBlock;

/******************************************************************************/

var getUserData = function(callback) {
    var onUserFiltersReady = function(details) {
        callback({
            'timeStamp': Date.now(),
            'version': vAPI.app.version,
            'userSettings': µb.userSettings,
            'filterLists': µb.remoteBlacklists,
            'netWhitelist': µb.stringFromWhitelist(µb.netWhitelist),
            'userFilters': details.content
        });
    };
    µb.assets.get('assets/user/filters.txt', onUserFiltersReady);
};

/******************************************************************************/

var restoreUserData = function(userData) {
    var countdown = 5;
    var onCountdown = function() {
        countdown -= 1;
        if ( countdown === 0 ) {
            vAPI.app.restart();
        }
    };

    var onAllRemoved = function() {
        // Be sure to adjust `countdown` if adding/removing anything below
        µBlock.saveLocalSettings(onCountdown);
        µb.XAL.keyvalSetMany(userData.userSettings, onCountdown);
        µb.XAL.keyvalSetOne('remoteBlacklists', userData.filterLists, onCountdown);
        µb.XAL.keyvalSetOne('netWhitelist', userData.netWhitelist, onCountdown);
        µb.assets.put('assets/user/filters.txt', userData.userFilters, onCountdown);
    };

    // If we are going to restore all, might as well wipe out clean local
    // storage
    µb.XAL.keyvalRemoveAll(onAllRemoved);
};

/******************************************************************************/

var resetUserData = function() {
    µb.XAL.keyvalRemoveAll();
    // Keep global counts, people can become quite attached to numbers
    µBlock.saveLocalSettings();
    vAPI.app.restart();
};

/******************************************************************************/

var onMessage = function(request, sender, callback) {
    // Async
    switch ( request.what ) {
        case 'getUserData':
            return getUserData(callback);

        default:
            break;
    }

    // Sync
    var response;

    switch ( request.what ) {
        case 'restoreUserData':
            restoreUserData(request.userData);
            break;

        case 'resetUserData':
            resetUserData();
            break;

        default:
            return vAPI.messaging.UNHANDLED;
    }

    callback(response);
};

vAPI.messaging.listen('settings.js', onMessage);

/******************************************************************************/

})();

/******************************************************************************/
/******************************************************************************/

// devtool-log.js

(function() {

'use strict';

/******************************************************************************/

var µb = µBlock;

/******************************************************************************/

var onMessage = function(request, sender, callback) {
    // Async
    switch ( request.what ) {
        default:
            break;
    }

    // Sync
    var response;

    switch ( request.what ) {
        case 'readLogBuffer':
            var pageStore = µb.pageStoreFromTabId(request.tabId);
            if ( pageStore ) {
                response = pageStore.logBuffer.readAll();
            }
            break;

        default:
            return vAPI.messaging.UNHANDLED;
    }

    callback(response);
};

vAPI.messaging.listen('devtool-log.js', onMessage);

/******************************************************************************/

})();

// https://www.youtube.com/watch?v=3_WcygKJP1k

/******************************************************************************/
