/*
  ztncui - ZeroTier network controller UI
  Copyright (C) 2017-2021  Key Networks (https://key-networks.com)
  Licensed under GPLv3 - see LICENSE for details.
*/

const fs = require('fs');
const ipaddr = require('ip-address');
const path = require('path');
const storage = require('node-persist');
const zt = require('./zt');
const util = require('util');
const config = require('../lib/config');

// Member names are also kept locally for controllers that cannot store the
// `name` field themselves. Keep that copy in the persistent data directory;
// older src/etc/storage notes are migrated once on first start.
require('../lib/migrateStorage')();
storage.initSync({ dir: config.storageDir });

// Dynamic res.render(req.params.object) must never be able to reach views
// outside the small set the UI actually uses.
const NETWORK_OBJECT_VIEWS = new Set([
  'private', 'routes', 'ipAssignmentPools', 'v4AssignMode',
  'v6AssignMode', 'dns', 'relays'
]);
const MEMBER_OBJECT_VIEWS = new Set(['ipAssignments']);

// ZeroTier 1.14+ can store a member name in the controller itself, while older
// controllers cannot. Prefer the controller value so names set through either
// ztncui or the ZeroTier API stay in sync (upstream issue #144).
function displayName(storedName, member) {
  if (member && typeof member.name === 'string' && member.name.trim()) {
    return member.name;
  }
  return storedName || '';
}

// jQuery serializes unchecked checkboxes as the string "false", so a plain
// truthiness check would silently skip de-authorization / bridge removal.
function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return /^(true|1)$/i.test(String(value).trim());
}

// ZeroTier 1.16 network relays are stored as a list of 10-hex-digit ZT addresses.
function parseRelayAddresses(value) {
  const addresses = [...new Set(
    String(value == null ? '' : value)
      .split(/[\s,;]+/)
      .map(address => address.trim().toLowerCase())
      .filter(Boolean)
  )];
  const invalid = addresses.filter(address => !/^[0-9a-f]{10}$/.test(address));
  return {relays: addresses, invalid};
}

async function get_network_with_members(nwid) {
  const [network, peers, members] = await Promise.all([
    zt.network_detail(nwid),
    zt.peers(),
    zt.members(nwid)
      .then(member_ids => {
        // Fix weird data returned by ZeroTier 1.12
        if (Array.isArray(member_ids)) {
          let obj = {};
          for (let id of member_ids) {
            let key = Object.keys(id)[0];
            let value = Object.values(id)[0];
            obj[key] = value;
          }
          member_ids = obj;
        }

        return Promise.all(
          Object.keys(member_ids)
            .map(id => Promise.all([
              zt.member_detail(nwid, id),
              storage.getItem(id)
            ]))
        );
      }).then(results => results.map(([member, name]) => {
        member.name = displayName(name, member);
        return member;
      }))
  ]);
  for (const member of members) {
    member.peer = peers.find(x => x.address === member.address);
  }
  return {network, members};
}

async function get_network_member(nwid, memberid) {
  const [network, member, peer, name] = await Promise.all([
    zt.network_detail(nwid),
    zt.member_detail(nwid, memberid),
    zt.peer(memberid),
    storage.getItem(memberid)
  ]);
  member.name = displayName(name, member);
  member.peer = peer;
  return {network, member};
}

// ZT network controller home page
exports.index = async function(req, res) {
  const navigate =
    {
      active: 'controller_home',
    }

  try {
    const zt_status = await zt.get_zt_status();
    res.render('index', {title: 'ztncui-fix', navigate: navigate, zt_status});
  } catch (err) {
    res.render('index', {title: 'ztncui-fix',
                      navigate: navigate, error: 'ERROR getting ZT status: ' + err});
  }
};

// Display list of all networks on this ZT network controller
exports.network_list = async function(req, res) {
  const navigate =
    {
      active: 'networks',
    }

  try {
    const networks = await zt.network_list();
    res.render('networks', {title: 'Networks on this controller', navigate: navigate, networks: networks});
  } catch (err) {
    res.render('networks', {title: 'Networks on this controller', navigate: navigate, error: 'Error retrieving list of networks on this controller: ' + err});
  }
};

// Display detail page for specific network
exports.network_detail = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: '/controller/networks'
    }

  try {
    const [
      {network, members},
      zt_address
    ] = await Promise.all([
      get_network_with_members(req.params.nwid),
      zt.get_zt_address()
    ]);
    res.render('network_detail', {title: 'Network ' + network.name, navigate: navigate, network: network, members: members, zt_address: zt_address});
  } catch (err) {
    res.render('network_detail', {title: 'Detail for network', navigate: navigate, error: 'Error resolving detail for network ' + req.params.nwid + ': ' + err});
  }
};

// Display Network create form on GET
exports.network_create_get = function(req, res) {
  const navigate =
    {
      active: 'add_network',
    }

  res.render('network_create', {title: 'Create network', navigate: navigate});
};

// Handle Network create on POST
exports.network_create_post = async function(req, res) {
  const navigate =
    {
      active: 'add_network',
    }

  req.checkBody('name', 'Network name required').notEmpty();

  req.sanitize('name').escape();
  req.sanitize('name').trim();

  const errors = req.validationErrors();

  let name = { name: req.body.name };

  if (errors) {
    res.render('network_create', {title: 'Create Network', navigate: navigate, name: name, errors: errors});
    return;
  } else {
    try {
      const network = await zt.network_create(name);
      res.redirect('/controller/network/' + network.nwid);
    } catch (err) {
      res.render('network_detail', {title: 'Create Network - error', navigate: navigate, error: 'Error creating network ' + name.name});
    }
  }
};

// Display Network delete form on GET
exports.network_delete_get = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: '/controller/networks'
    }

  try {
    const network = await zt.network_detail(req.params.nwid);
    res.render('network_delete', {title: 'Delete network', navigate: navigate,
                                    nwid: req.params.nwid, network: network});
  } catch (err) {
    res.render('network_delete', {title: 'Delete network', navigate: navigate, error: 'Error resolving network ' + req.params.nwid + ': ' + err});
  }
};

// Handle Network delete on POST
exports.network_delete_post = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: '/controller/networks'
    }

  try {
    const network = await zt.network_delete(req.params.nwid);
    res.render('network_delete', {title: 'Delete network', navigate: navigate, network: network});
  } catch (err) {
    res.render('network_delete', {title: 'Delete network', navigate: navigate, error: 'Error deleting network ' + req.params.nwid + ': ' + err});
  }
};

// Network object GET
exports.network_object = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }
  const view = req.params.object;

  if (!NETWORK_OBJECT_VIEWS.has(view)) {
    return res.render('not_implemented', {
      title: view, navigate: navigate, network: {nwid: req.params.nwid}
    });
  }

  try {
    const network = await zt.network_detail(req.params.nwid);
    navigate.whence = '/controller/network/' + network.nwid;
    res.render(view, {title: view, navigate: navigate, network: network}, function(err, html) {
      if (res.headersSent) return;
      if (err) {
        return res.render('not_implemented', {title: view, navigate: navigate, network: network});
      }
      res.send(html);
    });
  } catch (err) {
    if (res.headersSent) return;
    res.render('error', {
      title: view,
      navigate: navigate,
      message: 'Error resolving network',
      error: {status: 500, stack: 'Network ' + req.params.nwid + ': ' + err.message}
    });
  }
}

// Handle Network rename form on POST
exports.name = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: '/controller/networks'
    }

  req.checkBody('name', 'Network name required').notEmpty();
  req.sanitize('name').escape();
  req.sanitize('name').trim();

  const errors = req.validationErrors();

  let name = { name: req.body.name };

  if (errors) {
    console.error("network name validation errors", errors);
  } else {
    try {
      const network = await zt.network_object(req.params.nwid, name);
    } catch ( err) {
      console.error("Error renaming network " + req.params.nwid, err);
    }
  }
  res.redirect('/controller/network/' + req.params.nwid);
};

// ipAssignmentPools POST
exports.ipAssignmentPools = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }

  req.checkBody('ipRangeStart', 'IP range start required').notEmpty();
  req.checkBody('ipRangeStart', 'IP range start needs a valid IPv4 or IPv6 address').isIP();
  req.sanitize('ipRangeStart').escape();
  req.sanitize('ipRangeStart').trim();
  req.checkBody('ipRangeEnd', 'IP range end required').notEmpty();
  req.checkBody('ipRangeEnd', 'IP range end needs a valid IPv4 or IPv6 address').isIP();
  req.sanitize('ipRangEnd').escape();
  req.sanitize('ipRangEnd').trim();

  const errors = req.validationErrors();

  const ipAssignmentPool =
    {
      ipRangeStart: req.body.ipRangeStart,
      ipRangeEnd: req.body.ipRangeEnd
    };

  if (errors) {
    try {
      const network = await zt.network_detail(req.params.nwid);
      navigate.whence = '/controller/network/' + network.nwid;
      res.render('ipAssignmentPools', {title: 'ipAssignmentPools', navigate: navigate, ipAssignmentPool: ipAssignmentPool, network: network, errors: errors});
    } catch (err) {
      res.render('ipAssignmentPools', {title: 'ipAssignmentPools', navigate: navigate, error: 'Error resolving network detail for network ' + req.params.nwid + ': ' + err});
    }
  } else {
    try {
      const network = await zt.ipAssignmentPools(req.params.nwid, ipAssignmentPool, 'add');
      navigate.whence = '/controller/network/' + network.nwid;
      res.render('ipAssignmentPools', {title: 'ipAssignmentPools', navigate: navigate, ipAssignmentPool: ipAssignmentPool, network: network});
    } catch (err) {
      res.render('ipAssignmentPools', {title: 'ipAssignmentPools', navigate: navigate, error: 'Error applying IP Assignment Pools for network ' + req.params.nwid + ': ' + err});
    }
  }
}

isValidPrefix = function(str, max) {
  const num = Math.floor(Number(str));
  return String(num) == str && num >= 0 && num <= max;
}

// routes POST
exports.routes = async function (req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }

  req.checkBody('target', 'Target network is required').notEmpty();
  req.sanitize('target').trim();
  req.checkBody('target', 'Target network must be valid CIDR format')
    .custom(value => {
      const parts = value.split('/');
      const ipv4 = new ipaddr.Address4(parts[0]);
      const ipv6 = new ipaddr.Address6(parts[0]);
      let isValidIPv4orIPv6 = false;
      let prefixMax = 32;
      if (ipv4.isValid()) {
        isValidIPv4orIPv6 = true;
      } else {
      }
      if (ipv6.isValid()) {
        isValidIPv4orIPv6 = true;
        prefixMax = 128;
      } else {
      }
      return isValidIPv4orIPv6 && isValidPrefix(parts[1], prefixMax);
    });
  req.checkBody('via', 'Gateway must be a valid IPv4 or IPv6 address').optional({ checkFalsy: true }).isIP();
  req.sanitize('via').escape();
  req.sanitize('via').trim();
  if (! req.body.via) {
    req.body.via = null;
  }

  const errors = req.validationErrors();

  const route =
    {
      target: req.body.target,
      via: req.body.via
    };

  if (errors) {
    try {
      const network = await zt.network_detail(req.params.nwid);
      navigate.whence = '/controller/network/' + network.nwid;
      res.render('routes', {title: 'routes', navigate: navigate, route: route, network: network, errors: errors});
    } catch (err) {
      res.render('routes', {title: 'routes', navigate: navigate, error: 'Error resolving network detail'});
    }
  } else {
    try {
      const network = await zt.routes(req.params.nwid, route, 'add');
      navigate.whence = '/controller/network/' + network.nwid;
      res.render('routes', {title: 'routes', navigate: navigate, route: route, network: network});
    } catch (err) {
      res.render('routes', {title: 'routes', navigate: navigate, error: 'Error adding route for network ' + req.params.nwid + ': ' + err});
    }
  }

}

// route_delete GET
exports.route_delete = async function (req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }

  const route =
    {
      target: req.params.target_ip + '/' + req.params.target_prefix,
      via: null
    };


  try {
    const network = await zt.routes(req.params.nwid, route, 'delete');
    navigate.whence = '/controller/network/' + network.nwid;
    res.render('routes', {title: 'routes', navigate: navigate, route: route, network: network});
  } catch (err) {
    res.render('routes', {title: 'routes', navigate: navigate, error: 'Error deleting route for network ' + req.params.nwid + ': ' + err});
  }
}

// ipAssignmentPool_delete GET
exports.ipAssignmentPool_delete = async function (req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }

  const ipAssignmentPool =
    {
      ipRangeStart: req.params.ipRangeStart,
      ipRangeEnd: req.params.ipRangeEnd
    };


  try {
    const network = await zt.ipAssignmentPools(req.params.nwid, ipAssignmentPool, 'delete');
    navigate.whence = '/controller/network/' + network.nwid;
    res.render('ipAssignmentPools', {title: 'ipAssignmentPools', navigate: navigate, ipAssignmentPool: ipAssignmentPool, network: network});
  } catch (err) {
    res.render('ipAssignmentPools', {title: 'ipAssignmentPools', navigate: navigate, error: 'Error deleting IP Assignment Pool for network ' + req.params.nwid + ': ' + err});
  }
}

// private POST
exports.private = async function (req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }

  const private =
    {
      private: req.body.private
    };

  try {
    const network = await zt.network_object(req.params.nwid, private);
    navigate.whence = '/controller/network/' + network.nwid;
    res.render('private', {title: 'private', navigate: navigate, network: network});
  } catch (err) {
    res.render('private', {title: 'private', navigate: navigate, error: 'Error applying private for network ' + req.params.nwid + ': ' + err});
  }
}

// v4AssignMode POST
exports.v4AssignMode = async function (req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }

  const v4AssignMode =
    {
      v4AssignMode: { zt: req.body.zt }
    };

  try {
    const network = await zt.network_object(req.params.nwid, v4AssignMode);
    navigate.whence = '/controller/network/' + network.nwid;
    res.render('v4AssignMode', {title: 'v4AssignMode', navigate: navigate, network: network});
  } catch (err) {
    res.render('v4AssignMode', {title: 'v4AssignMode', navigate: navigate, error: 'Error applying v4AssignMode for network ' + req.params.nwid + ': ' + err});
  }
}

// v6AssignMode POST
exports.v6AssignMode = async function (req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }

  const v6AssignMode =
    {
      v6AssignMode:
        {
          '6plane': req.body['6plane'],
          'rfc4193': req.body.rfc4193,
          'zt': req.body.zt
        }
    };

  try {
    const network = await zt.network_object(req.params.nwid, v6AssignMode);
    navigate.whence = '/controller/network/' + network.nwid;
    res.render('v6AssignMode', {title: 'v6AssignMode', navigate: navigate, network: network});
  } catch (err) {
    res.render('v6AssignMode', {title: 'v6AssignMode', navigate: navigate, error: 'Error applying v6AssignMode for network ' + req.params.nwid + ': ' + err});
  }
}

// dns POST
exports.dns = async function (req, res) {
  const navigate = {
    active: 'networks',
    whence: ''
  };

  const dns = {
    dns: {
      domain: req.body.domain,
      servers: req.body.servers
        .split('\n')
        .map(x => x.trim())
        .filter(ip =>
          new ipaddr.Address4(ip).isValid() ||
          new ipaddr.Address6(ip).isValid()
        )
    }
  };

  try {
    const network = await zt.network_object(req.params.nwid, dns);
    navigate.whence = '/controller/network/' + network.nwid;
    res.render('dns', {title: 'dns', navigate: navigate, network: network});
  } catch (err) {
    res.render('dns', {title: 'dns', navigate: navigate, error: 'Error updating dns for network ' + req.params.nwid + ': ' + err});
  }
}

// relays POST (ZeroTier 1.16+ network-specific relay nodes)
exports.relays = async function (req, res) {
  const navigate = {
    active: 'networks',
    whence: ''
  };

  const parsed = parseRelayAddresses(req.body.relays);
  const errors = parsed.invalid.length
    ? [{
        msg: 'Invalid ZeroTier address(es): ' + parsed.invalid.join(', ') +
             '. Each relay must be a 10-character hexadecimal address.'
      }]
    : null;

  try {
    const network = errors
      ? await zt.network_detail(req.params.nwid)
      : await zt.network_object(req.params.nwid, {relays: parsed.relays});

    navigate.whence = '/controller/network/' + network.nwid;
    res.render('relays', {title: 'relays', navigate: navigate,
                          network: network, errors: errors});
  } catch (err) {
    res.render('relays', {title: 'relays', navigate: navigate,
                          error: 'Error updating relays for network ' +
                                 req.params.nwid + ': ' + err});
  }
}

// Display detail page for specific member
exports.member_detail = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }

  try {
    const {network, member} = await get_network_member(req.params.nwid, req.params.id);
    navigate.whence = '/controller/network/' + network.nwid + '#members';
    res.render('member_detail', {title: 'Network member detail', navigate: navigate, network: network, member: member});
  } catch (err) {
    if (res.headersSent) return;
    console.error(err);
    res.render('error', {
      title: 'Member detail',
      navigate: navigate,
      message: 'Error resolving member',
      error: {status: 500, stack: 'Member ' + req.params.id + ' of network ' + req.params.nwid + ': ' + err.message}
    });
  }
};

// Member object GET
exports.member_object = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }
  const view = req.params.object;

  if (!MEMBER_OBJECT_VIEWS.has(view)) {
    return res.render('not_implemented', {
      title: view, navigate: navigate, network: {nwid: req.params.nwid}
    });
  }

  try {
    const {network, member} = await get_network_member(req.params.nwid, req.params.id);
    navigate.whence = '/controller/network/' + network.nwid + '#members';
    res.render(view, {title: view, navigate: navigate, network: network, member: member}, function(err, html) {
      if (res.headersSent) return;
      if (err) {
        return res.render('not_implemented', {title: view, navigate: navigate, network: network, member: member});
      }
      res.send(html);
    });
  } catch (err) {
    if (res.headersSent) return;
    res.render('error', {
      title: view,
      navigate: navigate,
      message: 'Error resolving member',
      error: {status: 500, stack: 'Member ' + req.params.id + ' of network ' + req.params.nwid + ': ' + err.message}
    });
  }
}

// Easy network setup GET
exports.easy_get = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: '/controller/network/' + req.params.nwid
    }

  try {
    const network = await zt.network_detail(req.params.nwid);
    res.render('network_easy', {title: 'Easy setup of network', navigate: navigate, network: network});
  } catch (err) {
    res.render('network_easy', {title: 'Easy setup of network', navigate: navigate, error: 'Error resolving detail for network ' + req.params.nwid + ': ' + err});
  }
}

// Easy network setup POST
exports.easy_post = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: '/controller/networks'
    }

  req.checkBody('networkCIDR', 'Network address is required').notEmpty();
  req.sanitize('networkCIDR').trim();
  req.checkBody('networkCIDR', 'Network address must be in CIDR notation')
    .custom(value => {
      const parts = value.split('/');
      const ipv4 = new ipaddr.Address4(parts[0]);
      return ipv4.isValid() && isValidPrefix(parts[1], 32);
    });
  req.checkBody('poolStart', 'Start of IP assignment pool is required')
    .notEmpty();
  req.checkBody('poolStart', 'Start of IP assignment pool must be valid IPv4 address')
    .isIP(4);
  req.sanitize('poolStart').escape();
  req.sanitize('poolStart').trim();
  req.checkBody('poolEnd', 'End of IP assignment pool is required')
    .notEmpty();
  req.checkBody('poolEnd', 'End of IP assignment pool must be valid IPv4 address')
    .isIP(4);
  req.sanitize('poolEnd').escape();
  req.sanitize('poolEnd').trim();

  const errors = req.validationErrors();

  const ipAssignmentPools =
    [{
      ipRangeStart: req.body.poolStart,
      ipRangeEnd: req.body.poolEnd
    }];

  const routes =
    [{
      target: req.body.networkCIDR,
      via: null
    }];

  const v4AssignMode =
    {
      zt: true
    };

  if (errors) {
    network =
      {
        ipAssignmentPools: ipAssignmentPools,
        routes: routes,
        v4AssignMode: v4AssignMode
      };

    res.render('network_easy', {title: 'Easy setup of network', navigate: navigate, network: network, errors: errors});
  } else {
    try {
      const network = await zt.network_easy_setup(req.params.nwid,
                                                  routes,
                                                  ipAssignmentPools,
                                                  v4AssignMode);
      res.render('network_easy', {title: 'Easy setup of network', navigate: navigate, network: network, message: 'Network setup succeeded'});
    } catch (err) {
      res.render('network_easy', {title: 'Easy setup of network', navigate: navigate, error: 'Error resolving detail for network ' + req.params.nwid + ': ' + err});
    }
  }
}

// Easy members auth POST
exports.members = async function(req, res) {
  if (req.method !== 'POST') {
    return res.redirect('/controller/network/' + req.params.nwid + '#members');
  }

  req.checkBody('id', 'Member ID is required').notEmpty();
  req.sanitize('id').trim();
  req.sanitize('id').escape();

  // Check for undefined rather than truthiness: the UI sends "false" for an
  // unchecked box, and that update must not be skipped (issues #140, #146).
  if (req.body.auth !== undefined) {
    req.checkBody('auth', 'Authorization state must be boolean').isBoolean();
  }
  if (req.body.activeBridge !== undefined) {
    req.checkBody('activeBridge', 'activeBridge state must be boolean').isBoolean();
  }
  if (req.body.name !== undefined) {
    req.sanitize('name').trim();
    req.sanitize('name').escape();
  }

  const errors = req.validationErrors();
  if (errors) {
    return res.status(400).json({success: false, errors: errors});
  }

  const id = req.body.id;
  try {
    if (req.body.auth !== undefined) {
      await zt.member_object(req.params.nwid, id,
                             {authorized: toBoolean(req.body.auth)});
    }
    if (req.body.activeBridge !== undefined) {
      await zt.member_object(req.params.nwid, id,
                             {activeBridge: toBoolean(req.body.activeBridge)});
    }
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      await storage.setItem(id, name);
      // Keep the controller copy in sync when the ZT version supports it.
      // Older releases ignore/reject the field; the local name still works.
      try {
        await zt.member_object(req.params.nwid, id, {name: name});
      } catch (err) {
        console.error('Controller rejected member name for ' + id + ': ' + err);
      }
    }

    // The page uses $.post() without callbacks. Without a response the browser
    // keeps the request pending forever (upstream issues #140 and #146).
    return res.status(200).json({success: true});
  } catch (err) {
    console.error('Error updating member ' + id + ': ' + err);
    return res.status(500).json({success: false, error: String(err)});
  }
};

// Member delete GET or POST
exports.member_delete = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }

  try {
    const network = await zt.network_detail(req.params.nwid);
    let member = null;
    let name = null;
    if (req.method === 'POST') {
      member = await zt.member_delete(req.params.nwid, req.params.id);
      if (member.deleted) {
        name = await storage.removeItem(member.id);
      }
    } else {
      member = await zt.member_detail(req.params.nwid, req.params.id);
      name = await storage.getItem(member.id);
    }
    member.name = displayName(name, member);

    navigate.whence = '/controller/network/' + network.nwid;
    res.render('member_delete', {title: 'Delete member from ' + network.name,
                                  navigate: navigate, network: network, member: member});
  } catch (err) {
    res.render('member_delete', {title: 'Delete member from network', navigate: navigate,
                    error: 'Error resolving detail for member ' + req.params.id
                              + ' of network ' + req.params.nwid + ': ' + err});
  }
}

// ipAssignment delete GET
exports.delete_ip = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }

  try {
    const network = await zt.network_detail(req.params.nwid);
    let member = await zt.member_detail(req.params.nwid, req.params.id);
    navigate.whence = '/controller/network/' + network.nwid;
    member.name = displayName(await storage.getItem(member.id), member);
    if (req.params.index) {
      member = await zt.ipAssignmentDelete(network.nwid, member.id,
                                                              req.params.index);
      return res.redirect('/controller/network/' + network.nwid + '/member/' +
                                                  member.id + '/ipAssignments');
    }
    res.render('ipAssignments', {title: 'ipAssignments ' + network.name,
          navigate: navigate, index: req.params.index, network: network, member: member});
  } catch (err) {
    res.render('ipAssignments', {title: 'ipAssignments', navigate: navigate,
                    error: 'Error resolving detail for member ' + req.params.id
                              + ' of network ' + req.params.nwid + ': ' + err});
  }
}

// ipAssignments POST
exports.assign_ip = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }

  try {
    var network = await zt.network_detail(req.params.nwid);
  } catch (err) {
    throw err;
  }

  req.checkBody('ipAddress', 'IP address required').notEmpty();
  req.checkBody('ipAddress', 'IP address must be a valid IPv4 or IPv6 address').isIP();
  req.checkBody('ipAddress', 'IP address must fall within a managed route')
    .custom(value => {
      let ipAddressInManagedRoute = false;
      network.routes.forEach(function(item) {
        let ipv4 = new ipaddr.Address4(value);
        let target4 = new ipaddr.Address4(item.target);
        if (ipv4.isValid() && target4.isValid()) {
          if (ipv4.isInSubnet(target4)) ipAddressInManagedRoute =  true;
        }
        let ipv6 = new ipaddr.Address6(value);
        let target6 = new ipaddr.Address6(item.target);
        if (ipv6.isValid() && target6.isValid()) {
          if (ipv6.isInSubnet(target6)) ipAddressInManagedRoute =  true;
        }
      });
      return ipAddressInManagedRoute;
    });
  req.sanitize('ipAddress').escape();
  req.sanitize('ipAddress').trim();

  const errors = req.validationErrors();

  const ipAssignment = { ipAddress: req.body.ipAddress };

  try {
    let member = await zt.member_detail(req.params.nwid, req.params.id);
    navigate.whence = '/controller/network/' + network.nwid;

    if (!errors) {
      member = await zt.ipAssignmentAdd(network.nwid, member.id, ipAssignment);
    }

    member.name = displayName(await storage.getItem(member.id), member);

    res.render('ipAssignments', {title: 'ipAssignments', navigate: navigate,
                  ipAssignment: ipAssignment, network: network, member: member,
                                                               errors: errors});
  } catch (err) {
    res.render('ipAssignments', {title: 'ipAssignments', navigate: navigate,
                    error: 'Error resolving detail for member ' + req.params.id
                              + ' of network ' + req.params.nwid + ': ' + err});
  }
}
