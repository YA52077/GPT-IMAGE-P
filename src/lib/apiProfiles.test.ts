import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_IMAGES_MODEL,
  DEFAULT_OPENAI_PROFILE_ID,
  DEFAULT_SETTINGS,
  createDefaultOpenAIProfile,
  getActiveApiProfile,
  findEquivalentApiProfile,
  importCustomProviderDefinitionFromJson,
  importCustomProviderSettingsFromJson,
  mergeImportedSettings,
  normalizeSettings,
  switchApiProfileProvider,
  validateApiProfile,
} from './apiProfiles'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('validateApiProfile', () => {
  it('allows empty API URL when API proxy is enabled and available', () => {
    vi.stubEnv('VITE_API_PROXY_AVAILABLE', 'true')

    expect(validateApiProfile(createDefaultOpenAIProfile({
      baseUrl: '',
      apiKey: 'test-key',
      apiProxy: true,
    }))).toBeNull()
  })

  it('still requires API URL when API proxy is unavailable', () => {
    expect(validateApiProfile(createDefaultOpenAIProfile({
      baseUrl: '',
      apiKey: 'test-key',
      apiProxy: true,
    }))).toBe('缺少 API URL')
  })
})

describe('default API URL env', () => {
  it('applies shared URL params from VITE_DEFAULT_API_URL to the default profile', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_DEFAULT_API_URL', 'https://app.example.com/?apiUrl=https%3A%2F%2Fapi.example.com&apiMode=images&model=test-image-model&profileName=URL%20Profile&codexCli=true&streamImages=true&streamPartialImages=3')

    const { DEFAULT_SETTINGS, createDefaultOpenAIProfile } = await import('./apiProfiles')

    expect(createDefaultOpenAIProfile()).toMatchObject({
      name: 'URL Profile',
      baseUrl: 'https://api.example.com',
      model: 'test-image-model',
      apiMode: 'images',
      codexCli: true,
      streamImages: true,
      streamPartialImages: 3,
    })
    expect(DEFAULT_SETTINGS.profiles[0]).toMatchObject({
      name: 'URL Profile',
      baseUrl: 'https://api.example.com',
      model: 'test-image-model',
      apiMode: 'images',
      codexCli: true,
      streamImages: true,
      streamPartialImages: 3,
    })
  })

  it('keeps settings URLs out of the default API base URL', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_DEFAULT_API_URL', 'https://example.com/?settings={}')

    const { DEFAULT_SETTINGS } = await import('./apiProfiles')

    expect(DEFAULT_SETTINGS.baseUrl).toBe('')
    expect(DEFAULT_SETTINGS.profiles[0].baseUrl).toBe('')
  })
})

describe('removed provider profile migration', () => {
  const legacyProfile = {
    id: 'legacy-fal',
    name: 'Legacy',
    provider: 'fal',
    baseUrl: 'https://fal.run',
    apiKey: 'FAL_SECRET',
    model: 'openai/gpt-image-2',
    timeout: 300,
    apiMode: 'images',
    codexCli: false,
    apiProxy: false,
  }

  it('filters legacy profiles before normalization and preserves surviving order', () => {
    const customProvider = { id: 'custom-alpha', name: 'Custom Alpha', submit: { path: 'images/generations' } }
    const openaiProfile = {
      ...createDefaultOpenAIProfile({ id: 'openai-survivor', apiKey: 'openai-key' }),
      providerDrafts: {
        fal: { baseUrl: 'https://fal.run', model: 'legacy-model' },
        openai: { model: 'openai-draft' },
      },
    }
    const customProfile = { ...createDefaultOpenAIProfile({ id: 'custom-survivor' }), provider: customProvider.id }

    const settings = normalizeSettings({
      customProviders: [customProvider],
      profiles: [legacyProfile, openaiProfile, customProfile],
      activeProfileId: legacyProfile.id,
      agentTextProfileId: legacyProfile.id,
      agentImageProfileId: legacyProfile.id,
      providerOrder: ['fal', customProvider.id, 'openai'],
    })

    expect(settings.profiles.map((profile) => profile.id)).toEqual(['openai-survivor', 'custom-survivor'])
    expect(settings.activeProfileId).toBe('openai-survivor')
    expect(settings.agentTextProfileId).toBeNull()
    expect(settings.agentImageProfileId).toBe('openai-survivor')
    expect(settings.providerOrder).toEqual([customProvider.id, 'openai'])
    expect(settings.profiles[0].providerDrafts).toEqual({ openai: expect.objectContaining({ model: 'openai-draft' }) })
  })

  it('replaces a legacy-only list with a clean default without copying credentials or drafts', () => {
    const settings = normalizeSettings({
      baseUrl: legacyProfile.baseUrl,
      apiKey: legacyProfile.apiKey,
      model: legacyProfile.model,
      profiles: [{
        ...legacyProfile,
        providerDrafts: { fal: { baseUrl: legacyProfile.baseUrl, model: legacyProfile.model } },
      }],
      activeProfileId: legacyProfile.id,
    })

    expect(settings.profiles).toHaveLength(1)
    expect(settings.profiles[0]).toMatchObject({
      id: DEFAULT_OPENAI_PROFILE_ID,
      provider: 'openai',
      apiKey: '',
      model: DEFAULT_IMAGES_MODEL,
    })
    expect(settings.profiles[0].baseUrl).not.toBe(legacyProfile.baseUrl)
    expect(settings.profiles[0].providerDrafts).toBeUndefined()
  })

  it('reserves the removed provider id from custom provider reuse', () => {
    const settings = normalizeSettings({
      customProviders: [{ id: 'fal', name: 'Custom Attempt', submit: { path: 'images/generations' } }],
      profiles: [legacyProfile],
    })

    expect(settings.customProviders[0].id).toMatch(/^custom-/)
    expect(settings.customProviders[0].id).not.toBe('fal')
    expect(settings.profiles).toEqual([expect.objectContaining({ provider: 'openai', apiKey: '' })])
  })

  it('filters legacy profiles from wrapped JSON imports before generic normalization', () => {
    const imported = importCustomProviderSettingsFromJson(JSON.stringify({
      customProviders: [{ id: 'custom-json', name: 'Custom JSON', submit: { path: 'images/generations' } }],
      profiles: [legacyProfile, {
        ...createDefaultOpenAIProfile({ id: 'custom-profile', apiKey: 'custom-key' }),
        provider: 'custom-json',
      }],
    }))

    expect(imported.profiles).toEqual([expect.objectContaining({ id: 'custom-profile', provider: 'custom-json', apiKey: 'custom-key' })])
  })
})

describe('mergeImportedSettings', () => {
  it('replaces the default OpenAI profile with legacy imported settings when current settings are untouched', () => {
    const merged = mergeImportedSettings(DEFAULT_SETTINGS, {
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'imported-key',
      model: 'imported-model',
      timeout: 120,
      apiMode: 'responses',
      codexCli: true,
      apiProxy: true,
    })

    expect(merged.profiles).toHaveLength(1)
    expect(merged.activeProfileId).toBe(DEFAULT_OPENAI_PROFILE_ID)
    expect(merged.profiles[0]).toMatchObject({
      id: DEFAULT_OPENAI_PROFILE_ID,
      provider: 'openai',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'imported-key',
      model: 'imported-model',
      timeout: 120,
      apiMode: 'responses',
      codexCli: true,
      apiProxy: true,
    })
  })

  it('deduplicates imported profiles when replacing untouched default settings', () => {
    const merged = mergeImportedSettings(DEFAULT_SETTINGS, {
      profiles: [
        {
          id: 'imported-openai-a',
          name: 'Imported OpenAI A',
          provider: 'openai',
          baseUrl: 'https://api.example.com/v1',
          apiKey: 'openai-key',
          model: DEFAULT_IMAGES_MODEL,
          timeout: 300,
          apiMode: 'images',
          codexCli: false,
          apiProxy: false,
        },
        {
          id: 'imported-openai-b',
          name: 'Imported OpenAI B',
          provider: 'openai',
          baseUrl: 'https://api.example.com/v1/',
          apiKey: 'openai-key',
          model: DEFAULT_IMAGES_MODEL,
          timeout: 600,
          apiMode: 'images',
          codexCli: true,
          apiProxy: true,
        },
      ],
      activeProfileId: 'imported-openai-b',
    })

    expect(merged.profiles).toHaveLength(1)
    expect(merged.profiles[0].id).toBe('imported-openai-a')
    expect(merged.activeProfileId).toBe('imported-openai-a')
  })

  it('appends imported legacy settings as a new profile when current settings are customized', () => {
    const current = mergeImportedSettings(DEFAULT_SETTINGS, {
      baseUrl: 'https://current.example.com/v1',
      apiKey: 'current-key',
      model: 'current-model',
    })
    const merged = mergeImportedSettings(current, {
      baseUrl: 'https://imported.example.com/v1',
      apiKey: 'imported-key',
      model: 'imported-model',
    })

    expect(merged.profiles).toHaveLength(2)
    expect(merged.activeProfileId).toBe(DEFAULT_OPENAI_PROFILE_ID)
    expect(merged.profiles[0]).toMatchObject({ apiKey: 'current-key', model: 'current-model' })
    expect(merged.profiles[1]).toMatchObject({
      provider: 'openai',
      baseUrl: 'https://imported.example.com/v1',
      apiKey: 'imported-key',
      model: 'imported-model',
    })
    expect(merged.profiles[1].id).not.toBe(DEFAULT_OPENAI_PROFILE_ID)
  })

  it('reuses an existing keyed profile when importing the same custom profile without an API key', () => {
    const current = mergeImportedSettings(DEFAULT_SETTINGS, {
      customProviders: [{
        id: 'custom-json',
        name: 'Custom JSON',
        submit: {
          path: 'images/generations',
          method: 'POST',
          contentType: 'json',
          body: { model: '$profile.model', prompt: '$prompt' },
          result: { imageUrlPaths: ['data.*.url'], b64JsonPaths: [] },
        },
      }],
      profiles: [{
        id: 'existing-custom',
        name: 'Existing Custom',
        provider: 'custom-json',
        baseUrl: 'https://custom.example.com/v1',
        apiKey: 'existing-key',
        model: 'custom-model',
        timeout: 300,
        apiMode: 'images',
        codexCli: false,
        apiProxy: false,
      }],
      activeProfileId: 'existing-custom',
    })
    const imported = normalizeSettings({
      customProviders: [{
        id: 'custom-json',
        name: 'Custom JSON',
        submit: {
          path: 'images/generations',
          method: 'POST',
          contentType: 'json',
          body: { model: '$profile.model', prompt: '$prompt' },
          result: { imageUrlPaths: ['data.*.url'], b64JsonPaths: [] },
        },
      }],
      profiles: [{
        id: 'imported-custom',
        name: 'Imported Custom',
        provider: 'custom-json',
        baseUrl: 'https://custom.example.com/v1',
        apiKey: '',
        model: 'custom-model',
        timeout: 300,
        apiMode: 'images',
        codexCli: false,
        apiProxy: false,
      }],
    })
    const merged = mergeImportedSettings(current, imported)
    const match = findEquivalentApiProfile(merged, imported.profiles[0], imported.customProviders)

    expect(merged.profiles).toHaveLength(1)
    expect(match?.id).toBe('existing-custom')
  })

  it('does not replace existing custom providers when only the default profile remains', () => {
    const current = normalizeSettings({
      ...DEFAULT_SETTINGS,
      customProviders: [{
        id: 'custom-existing',
        name: 'Existing Provider',
        submit: { path: 'images/generations' },
      }],
    })
    const merged = mergeImportedSettings(current, {
      customProviders: [{
        id: 'custom-imported',
        name: 'Imported Provider',
        submit: { path: 'images/generations' },
      }],
      profiles: [{
        id: 'imported-custom',
        name: 'Imported Custom',
        provider: 'custom-imported',
        baseUrl: 'https://custom.example.com/v1',
        apiKey: '',
        model: 'custom-model',
        timeout: 300,
        apiMode: 'images',
        codexCli: false,
        apiProxy: false,
      }],
    })

    expect(merged.customProviders.map((provider) => provider.id)).toEqual(['custom-existing', 'custom-imported'])
    expect(merged.profiles).toHaveLength(2)
  })

  it('appends imported custom providers and keeps imported custom profile references', () => {
    const current = mergeImportedSettings(DEFAULT_SETTINGS, {
      baseUrl: 'https://current.example.com/v1',
      apiKey: 'current-key',
      model: 'current-model',
    })
    const merged = mergeImportedSettings(current, {
      customProviders: [{
        id: 'custom-json',
        name: 'Custom JSON',
        submit: {
          path: 'images/generations',
          method: 'POST',
          contentType: 'json',
          body: { model: '$profile.model', prompt: '$prompt' },
          result: { imageUrlPaths: ['data.*.url'], b64JsonPaths: [] },
        },
      }],
      profiles: [{
        id: 'imported-custom',
        name: 'Imported Custom',
        provider: 'custom-json',
        baseUrl: 'https://custom.example.com/v1',
        apiKey: 'custom-key',
        model: 'custom-model',
        timeout: 300,
        apiMode: 'images',
        codexCli: false,
        apiProxy: false,
      }],
    })

    expect(merged.customProviders).toHaveLength(1)
    expect(merged.customProviders[0]).toMatchObject({ id: 'custom-json', name: 'Custom JSON' })
    expect(merged.profiles).toHaveLength(2)
    expect(merged.profiles[1]).toMatchObject({
      name: 'Imported Custom',
      provider: 'custom-json',
      apiKey: 'custom-key',
      model: 'custom-model',
    })
  })
})

describe('custom providers', () => {
  it('normalizes custom provider definitions and keeps custom profiles', () => {
    const settings = normalizeSettings({
      customProviders: [{
        id: 'custom-async',
        name: 'Custom Async',
        template: 'openai-compatible-async',
        generationPath: '/v1/images/generations',
        editPath: '/v1/images/edits',
        taskPath: '/v1/images/tasks/{task_id}',
      }],
      profiles: [{
        id: 'profile-custom',
        name: 'Custom Profile',
        provider: 'custom-async',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'key',
        model: 'model',
        timeout: 60,
        apiMode: 'images',
        codexCli: false,
        apiProxy: false,
      }],
      activeProfileId: 'profile-custom',
    })

    expect(settings.customProviders[0]).toMatchObject({
      id: 'custom-async',
      template: 'http-image',
      submit: {
        path: 'images/generations',
        query: { async: 'true' },
        taskIdPath: 'data',
      },
      editSubmit: {
        path: 'images/edits',
        query: { async: 'true' },
        taskIdPath: 'data',
      },
      poll: {
        path: 'images/tasks/{task_id}',
      },
    })
    expect(settings.profiles[0].provider).toBe('custom-async')
  })

  it('normalizes an Apimart-style task manifest', () => {
    const provider = importCustomProviderDefinitionFromJson(JSON.stringify({
      name: 'Apimart GPT-Image-2',
      template: 'http-image',
      submit: {
        path: '/v1/images/generations',
        method: 'POST',
        contentType: 'json',
        body: {
          model: '$profile.model',
          prompt: '$prompt',
          n: '$params.n',
          size: '$params.size',
          resolution: '2k',
          image_urls: '$inputImages.dataUrls',
        },
        taskIdPath: 'data.0.task_id',
      },
      poll: {
        path: '/v1/tasks/{task_id}',
        method: 'GET',
        query: { language: 'zh' },
        statusPath: 'data.status',
        successValues: ['completed'],
        failureValues: ['failed', 'cancelled'],
        result: {
          imageUrlPaths: ['data.result.images.*.url.*'],
        },
      },
    }))

    expect(provider).toMatchObject({
      template: 'http-image',
      submit: {
        path: 'images/generations',
        taskIdPath: 'data.0.task_id',
      },
      poll: {
        path: 'tasks/{task_id}',
        query: { language: 'zh' },
        successValues: ['completed'],
        result: {
          imageUrlPaths: ['data.result.images.*.url.*'],
        },
      },
    })
  })

  it('imports wrapped custom provider settings with profiles', () => {
    const imported = importCustomProviderSettingsFromJson(JSON.stringify({
      customProviders: [{
        id: 'custom-json',
        name: 'Custom JSON',
        submit: {
          path: 'images/generations',
          method: 'POST',
          contentType: 'json',
          body: { model: '$profile.model', prompt: '$prompt' },
          result: { imageUrlPaths: ['data.*.url'], b64JsonPaths: [] },
        },
      }],
      profiles: [{
        name: 'Custom JSON',
        provider: 'custom-json',
        baseUrl: 'https://custom.example.com/v1',
        model: 'custom-model',
        apiMode: 'images',
      }],
    }))

    expect(imported.customProviders[0]).toMatchObject({ id: 'custom-json', name: 'Custom JSON' })
    expect(imported.profiles[0]).toMatchObject({
      name: 'Custom JSON',
      provider: 'custom-json',
      baseUrl: 'https://custom.example.com/v1',
      apiKey: '',
      model: 'custom-model',
      apiMode: 'images',
    })
  })

  it('imports wrapped custom provider settings from a json code block', () => {
    const imported = importCustomProviderSettingsFromJson(`\`\`\`json
{"customProviders":[{"id":"custom-json","name":"Custom JSON","submit":{"path":"images/generations","method":"POST","contentType":"json","body":{"model":"$profile.model","prompt":"$prompt"},"result":{"imageUrlPaths":["data.result.images.*.url.*"],"b64JsonPaths":[]}}}],"profiles":[{"name":"Custom JSON","provider":"custom-json","baseUrl":"https://custom.example.com/v1","model":"custom-model","apiMode":"images"}]}
\`\`\``)

    expect(imported.customProviders[0]).toMatchObject({ id: 'custom-json' })
    expect(imported.customProviders[0].submit.result).toMatchObject({
      imageUrlPaths: ['data.result.images.*.url.*'],
    })
    expect(imported.profiles[0]).toMatchObject({
      provider: 'custom-json',
      baseUrl: 'https://custom.example.com/v1',
    })
  })

  it('rejects markdown-corrupted profile fields when importing wrapped settings', () => {
    expect(() => importCustomProviderSettingsFromJson(JSON.stringify({
      customProviders: [{
        id: 'custom-apimart',
        name: 'APIMart',
        submit: { path: 'images/generations' },
      }],
      profiles: [{
        name: 'APIMart',
        provider: 'custom-apimart',
        baseUrl: '[https://api.apimart.ai/v1',
        model: 'gpt-image-2-official',
        apiMode: 'images](https://api.apimart.ai/v1%22,%22model%22:%22gpt-image-2-official%22,%22apiMode%22:%22images)',
      }],
    }))).toThrow('JSON 包含 Markdown 链接')
  })

  it('uses API-mode specific streaming defaults and preserves partial image count', () => {
    expect(createDefaultOpenAIProfile().streamImages).toBe(false)
    expect(createDefaultOpenAIProfile({ apiMode: 'responses' }).streamImages).toBe(true)
    expect(createDefaultOpenAIProfile().streamPartialImages).toBe(1)
    expect(DEFAULT_SETTINGS.streamImages).toBe(false)
    expect(DEFAULT_SETTINGS.streamPartialImages).toBe(1)
    expect(DEFAULT_SETTINGS.profiles[0].streamImages).toBe(false)
    expect(DEFAULT_SETTINGS.profiles[0].streamPartialImages).toBe(1)
    expect(normalizeSettings({ apiMode: 'responses' }).streamImages).toBe(true)

    const normalized = normalizeSettings({
      profiles: [
        createDefaultOpenAIProfile({ streamImages: false, streamPartialImages: 3 }),
      ],
    })

    expect(normalized.streamImages).toBe(false)
    expect(normalized.streamPartialImages).toBe(3)
    expect(normalized.profiles[0].streamImages).toBe(false)
    expect(normalized.profiles[0].streamPartialImages).toBe(3)

    const clamped = normalizeSettings({
      profiles: [
        createDefaultOpenAIProfile({ streamPartialImages: 8 }),
      ],
    })

    expect(clamped.profiles[0].streamPartialImages).toBe(3)
  })

  it('normalizes custom providers to Images API mode', () => {
    const settings = normalizeSettings({
      customProviders: [{ id: 'custom-json', name: 'Custom JSON', submit: { path: 'images/generations' } }],
      profiles: [{
        id: 'custom-profile',
        name: 'Custom Profile',
        provider: 'custom-json',
        baseUrl: 'https://custom.example.com/v1',
        apiKey: 'custom-key',
        model: 'custom-model',
        apiMode: 'responses',
        streamImages: true,
      }],
    })

    expect(settings.profiles[0]).toMatchObject({
      provider: 'custom-json',
      apiMode: 'images',
      streamImages: false,
    })
  })

  it('keeps active custom providers in Images API mode when legacy apiMode is responses', () => {
    const settings = normalizeSettings({
      apiMode: 'responses',
      customProviders: [{ id: 'custom-json', name: 'Custom JSON', submit: { path: 'images/generations' } }],
      activeProfileId: 'custom-profile',
      profiles: [{
        id: 'custom-profile',
        name: 'Custom Profile',
        provider: 'custom-json',
        baseUrl: 'https://custom.example.com/v1',
        apiKey: 'custom-key',
        model: 'custom-model',
      }],
    })

    const activeProfile = getActiveApiProfile({ ...settings, apiMode: 'responses', streamImages: true })
    expect(activeProfile.apiMode).toBe('images')
    expect(activeProfile.streamImages).toBe(false)
  })

  it('enables Agent submit auto scroll by default', () => {
    expect(DEFAULT_SETTINGS.agentScrollToBottomAfterSubmit).toBe(true)
    expect(normalizeSettings({}).agentScrollToBottomAfterSubmit).toBe(true)
    expect(normalizeSettings({ agentScrollToBottomAfterSubmit: false }).agentScrollToBottomAfterSubmit).toBe(false)
  })

  it('enables Agent math formatting prompt by default', () => {
    expect(DEFAULT_SETTINGS.agentMathFormattingPrompt).toBe(true)
    expect(normalizeSettings({}).agentMathFormattingPrompt).toBe(true)
    expect(normalizeSettings({ agentMathFormattingPrompt: false }).agentMathFormattingPrompt).toBe(false)
  })

  it('disables prompt rewrite allowance by default', () => {
    expect(DEFAULT_SETTINGS.allowPromptRewrite).toBe(false)
    expect(normalizeSettings({}).allowPromptRewrite).toBe(false)
    expect(normalizeSettings({ allowPromptRewrite: true }).allowPromptRewrite).toBe(true)
  })

})
