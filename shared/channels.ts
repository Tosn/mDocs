// IPC 通道名集中定义（plan §5）。约定：`<domain>:<method>`。
export const CHANNELS = {
  folder: {
    list: 'folder:list',
    tree: 'folder:tree',
    create: 'folder:create',
    rename: 'folder:rename',
    delete: 'folder:delete'
  },
  document: {
    listByFolder: 'document:listByFolder',
    get: 'document:get',
    getFileUrl: 'document:getFileUrl',
    pickPaths: 'document:pickPaths',
    upload: 'document:upload',
    importFolder: 'document:importFolder',
    createDoc: 'document:createDoc',
    suggestName: 'document:suggestName',
    updateContent: 'document:updateContent',
    rename: 'document:rename',
    delete: 'document:delete'
  },
  search: {
    keyword: 'search:keyword'
  },
  trash: {
    list: 'trash:list',
    restore: 'trash:restore',
    purge: 'trash:purge'
  },
  crawl: {
    fromUrl: 'crawl:fromUrl',
    fromUrlInteractive: 'crawl:fromUrlInteractive'
  },
  chat: {
    listSessions: 'chat:listSessions',
    createSession: 'chat:createSession',
    getMessages: 'chat:getMessages',
    ask: 'chat:ask'
  },
  settings: {
    listModels: 'settings:listModels',
    getActiveModel: 'settings:getActiveModel',
    switchModel: 'settings:switchModel',
    saveModel: 'settings:saveModel',
    testModel: 'settings:testModel',
    getPrivacyNotice: 'settings:getPrivacyNotice'
  }
} as const

// 主 → 渲染 的事件通道（流式 / 进度）。
export const EVENTS = {
  chatToken: 'chat:token',
  chatSources: 'chat:sources',
  chatDone: 'chat:done',
  chatError: 'chat:error',
  importProgress: 'import:progress'
} as const
