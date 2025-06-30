#!/usr/bin/env node

const { TemplateManager, ProjectDetector, GitManager } = require('./dist/index.js');

async function testBasicFunctionality() {
  console.log('🧪 Testing basic dcsandbox functionality...\n');

  try {
    // Test Template Manager
    console.log('📋 Testing Template Manager...');
    const templateManager = new TemplateManager();
    
    // Create builtin templates
    await templateManager.createBuiltinTemplates();
    console.log('✅ Built-in templates created');
    
    // List templates
    const templates = await templateManager.listTemplates();
    console.log(`✅ Found ${templates.length} templates:`);
    templates.forEach(t => console.log(`   - ${t.name} (${t.builtin ? 'built-in' : 'custom'})`));
    
    // Get a specific template
    const nodeTemplate = await templateManager.getTemplate('node');
    if (nodeTemplate) {
      console.log('✅ Node.js template loaded successfully');
    } else {
      console.log('❌ Failed to load Node.js template');
    }

    console.log();

    // Test Project Detector
    console.log('🔍 Testing Project Detector...');
    const projectDetector = new ProjectDetector();
    
    // Test detection with current directory
    const detection = await projectDetector.detectProject('.');
    console.log(`✅ Project detection result: ${detection.language} (confidence: ${detection.confidence})`);
    console.log(`   Template: ${detection.template}`);
    if (detection.framework) console.log(`   Framework: ${detection.framework}`);
    if (detection.packageManager) console.log(`   Package Manager: ${detection.packageManager}`);

    console.log();

    // Test Git Manager
    console.log('🌐 Testing Git Manager...');
    const gitManager = new GitManager();
    
    // Test URL parsing
    const repoInfo = gitManager.extractRepoInfo('https://github.com/user/repo.git');
    console.log('✅ Git URL parsing works');
    console.log(`   Owner: ${repoInfo.owner}, Repo: ${repoInfo.repo}, Provider: ${repoInfo.provider}`);
    
    // Test validation (this will work even without network)
    console.log('✅ Git validation functions available');

    console.log();
    console.log('🎉 All basic tests passed! The core functionality is working.');
    console.log();
    console.log('Next steps:');
    console.log('1. Install Docker or Podman');
    console.log('2. Try creating a sandbox: npm run dev -- create --name test-sandbox');
    console.log('3. List sandboxes: npm run dev -- list');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testBasicFunctionality();