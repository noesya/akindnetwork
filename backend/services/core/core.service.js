'use strict';

const path = require('path');
const { CoreService } = require('@semapps/core');
const { apods, notify, interop, oidc } = require('@semapps/ontologies');

/**
 * SemApps core bundle — instantiates ldp, triplestore, activitypub, webacl,
 * ontologies, etc. Without it, AppService hangs forever waiting on
 * `ldp.resource`, `activitypub.follow`, etc.
 *
 * Configuration shape lifted from activitypods/app-boilerplate (the official
 * starter), adapted to our existing env var names.
 */
module.exports = {
  mixins: [CoreService],
  settings: {
    baseUrl: process.env.APP_BASE_URL,
    baseDir: path.resolve(__dirname, '../..'),
    triplestore: {
      url: process.env.SPARQL_ENDPOINT,
      user: process.env.SPARQL_USER,
      password: process.env.SPARQL_PASSWORD,
      mainDataset: process.env.MAIN_DATASET || 'kind'
    },
    // Core ActivityPods ontologies we MUST load to talk to compatible Pods.
    // The kind: ontology is registered separately (TODO follow-up).
    ontologies: [apods, notify, interop, oidc],
    activitypub: {
      queueServiceUrl: process.env.REDIS_URL
    },
    api: {
      port: parseInt(process.env.PORT || '3000', 10)
    },
    ldp: {
      resourcesWithContainerPath: false
    },
    void: false,
    webid: false
  }
};
