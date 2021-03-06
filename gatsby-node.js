const path = require(`path`);
const fs = require(`fs-extra`);

let runNumber = parseInt(process.env.ARTIFACTS_RUN_SETUP, 10) || 1;
let paramLessSourceRefreshes = 0;
let isFirstRun = runNumber === 1;

let changedSsrCompilationHash;
let changedBrowserCompilationHash;

exports.onPreInit = ({ emitter }) => {
  emitter.on(`SET_SSR_WEBPACK_COMPILATION_HASH`, (action) => {
    changedSsrCompilationHash = action.payload;
  });

  emitter.on(`SET_WEBPACK_COMPILATION_HASH`, (action) => {
    changedBrowserCompilationHash = action.payload;
  });
};

let previouslyCreatedNodes = new Map();

exports.sourceNodes = ({
  actions,
  createContentDigest,
  webhookBody,
  reporter,
}) => {
  if (webhookBody && webhookBody.runNumber) {
    runNumber = webhookBody.runNumber;
    isFirstRun = runNumber === 1;
  } else {
    runNumber += paramLessSourceRefreshes;
    isFirstRun = runNumber === 1;
    paramLessSourceRefreshes = 1;
  }

  reporter.info(`Using test setup #${runNumber}`);

  const currentlyCreatedNodes = new Map();

  function createNodeHelper(type, nodePartial) {
    const node = {
      ...nodePartial,
      internal: {
        type,
        contentDigest: createContentDigest(nodePartial),
      },
    };
    actions.createNode(node);
    currentlyCreatedNodes.set(node.id, node);
  }

  // used to create pages and queried by them
  createNodeHelper(`DepPageQuery`, {
    id: `page-query-stable`,
    label: `Stable (always created)`,
  });

  createNodeHelper(`DepPageQuery`, {
    id: `page-query-changing-but-not-invalidating-html`,
    label: `Stable (always created)`,
    buildRun: runNumber, // important for test setup - this will invalidate page queries, but shouldn't invalidate html (if it's not queried)
  });

  createNodeHelper(`DepPageQuery`, {
    id: `page-query-changing-data-but-not-id`,
    label: `This is${isFirstRun ? `` : ` not`} a first run`, // this will be queried - we want to invalidate html here
  });

  createNodeHelper(`DepPageQuery`, {
    id: `page-query-dynamic-${runNumber}`, // this should cause different page path
    label: `This is run number ${runNumber}`,
  });

  // used by static queries
  createNodeHelper(`DepStaticQuery`, {
    id: `static-query-stable`,
    label: `Stable (always created)`,
  });

  createNodeHelper(`DepStaticQuery`, {
    id: `static-query-changing-but-not-invalidating-html`,
    label: `Stable (always created)`,
    buildRun: runNumber, // important for test setup - this will invalidate static query, but shouldn't invalidate html (if it's not queried)
  });

  createNodeHelper(`DepStaticQuery`, {
    id: `static-query-changing-data-but-not-id`,
    label: `This is${isFirstRun ? `` : ` not`} a first run`, // this will be queried - we want to invalidate html here
  });

  for (const prevNode of previouslyCreatedNodes.values()) {
    if (!currentlyCreatedNodes.has(prevNode.id)) {
      actions.deleteNode({ node: prevNode });
    }
  }
  previouslyCreatedNodes = currentlyCreatedNodes;
};

exports.createPages = async ({ actions, graphql }) => {
  // testing if expected html/page-data files exist OR don't exist (if stale artifacts are removed)
  function createPageHelper(dummyId) {
    actions.createPage({
      path: `/stale-pages/${dummyId}`,
      component: require.resolve(`./src/templates/dummy`),
      context: {
        dummyId,
      },
    });
  }

  // stable page that always gets created
  createPageHelper(`stable`);

  if (isFirstRun) {
    // page exists only in first run
    createPageHelper(`only-in-first`);
  } else {
    // page exists in any run other than first
    createPageHelper(`only-not-in-first`);
  }

  const { data } = await graphql(`
    {
      allDepPageQuery {
        nodes {
          id
        }
      }
    }
  `);

  for (const depPageQueryNode of data.allDepPageQuery.nodes) {
    actions.createPage({
      path: `/${depPageQueryNode.id}/`,
      component: require.resolve(`./src/templates/deps-page-query`),
      context: {
        id: depPageQueryNode.id,
      },
    });
  }
};

exports.onPreBuild = () => {
  console.log(`[test] onPreBuild`);
  changedSsrCompilationHash = `not-changed`;
  changedBrowserCompilationHash = `not-changed`;
};

let counter = 1;
exports.onPostBuild = async ({ graphql }) => {
  console.log(`[test] onPostBuild`);
  const { data } = await graphql(`
    {
      allSitePage(filter: { path: { ne: "/dev-404-page/" } }) {
        nodes {
          path
        }
      }
    }
  `);

  fs.writeJSONSync(
    path.join(
      process.cwd(),
      `.cache`,
      `build-manifest-for-test-${counter++}.json`
    ),
    {
      allPages: data.allSitePage.nodes.map((node) => node.path),
      changedSsrCompilationHash,
      changedBrowserCompilationHash,
    }
  );
};
