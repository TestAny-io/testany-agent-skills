import { AppError } from './files.mjs';

// Authentication belongs to the user's Git/SSH setup. Never collect helper output
// in SkillDock or store credentials alongside the source record.
export function gitNetworkEnvironment(base = process.env) {
  const env = { ...base, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GH_PROMPT_DISABLED: '1',
    GIT_ASKPASS: '/usr/bin/false', SSH_ASKPASS: '/usr/bin/false', SSH_ASKPASS_REQUIRE: 'never', GIT_LFS_SKIP_SMUDGE: '1' };
  for (const key of Object.keys(env)) {
    if (/^GIT_CONFIG_(KEY|VALUE|COUNT|PARAMETERS)|^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|EXEC_PATH)$|^GIT_TRACE|^GIT_CURL_VERBOSE$/.test(key)) delete env[key];
  }
  return env;
}

export function gitAccessError(error) {
  if (error.code !== 'CLI_FAILED') return error;
  const message = error.message;
  if (/host key verification failed|remote host identification has changed/i.test(message))
    return new AppError(422, 'GIT_HOST_UNVERIFIED', 'SSH 主机尚未验证或主机密钥已变化。请先在终端核验该主机，再重试；SkillDock 不自动信任新的主机密钥。');
  if (/authentication failed|could not read (?:Username|Password)|terminal prompts disabled|permission denied[^\n]*(?:publickey|password)|HTTP Basic: Access denied|returned error: (?:401|403)|authentication required|could not authenticate|(?:SAML|SSO)[^\n]*(?:authoriz|authenticat)|(?:enabled|enforced)[^\n]*(?:SAML|SSO)/i.test(message))
    return new AppError(422, 'GIT_AUTH_REQUIRED', 'Git 认证失败或当前账号无权访问。请先在这台电脑配置 HTTPS 登录或 SSH 密钥，并确认私有仓库及组织授权，再重试。定时更新也使用同一凭据。');
  if (/repository[^\n]*not found|repository[^\n]*does not exist/i.test(message))
    return new AppError(422, 'GIT_REPOSITORY_UNAVAILABLE', '仓库不存在，或当前 Git 账号没有访问权限。请核对仓库地址和本机 Git 授权；浏览器中能打开仓库并不代表 Git 已登录。');
  return error;
}
