import { browser } from 'wxt/browser';
import { workerPermission } from './settings';
import { IMAGE_HOST_PERMISSION } from './images';

const AI_DATA_PERMISSIONS = ['websiteContent', 'personallyIdentifyingInfo', 'personalCommunications'];
type DataPermissions = { data_collection?: string[] };

function dataPermissions(hasToken: boolean): string[] {
  return hasToken ? [...AI_DATA_PERMISSIONS, 'authenticationInfo'] : AI_DATA_PERMISSIONS;
}

export async function hasBuiltInDataConsent(): Promise<boolean> {
  return 'data_collection' in await browser.permissions.getAll();
}

export function requestQuestionPermission(workerUrl: string, builtInDataConsent: boolean, hasToken: boolean): Promise<boolean> {
  return browser.permissions.request({
    origins: [workerPermission(workerUrl)],
    ...(builtInDataConsent && hasToken ? { data_collection: ['authenticationInfo'] } : {}),
  });
}

export async function hasQuestionPermission(workerUrl: string, hasToken: boolean): Promise<boolean> {
  if (!await browser.permissions.contains({ origins: [workerPermission(workerUrl)] })) return false;
  if (!hasToken) return true;
  const permissions: DataPermissions & { origins?: string[] } = await browser.permissions.getAll();
  return permissions.data_collection === undefined || permissions.data_collection.includes('authenticationInfo');
}

export function requestAiPermission(workerUrl: string, builtInDataConsent: boolean, hasToken: boolean): Promise<boolean> {
  const permissions = {
    origins: [workerPermission(workerUrl), IMAGE_HOST_PERMISSION],
    ...(builtInDataConsent ? { data_collection: dataPermissions(hasToken) } : {}),
  };
  return browser.permissions.request(permissions);
}

export async function hasAiPermission(workerUrl: string, hasToken: boolean, hasImages = false): Promise<boolean> {
  const origins = [workerPermission(workerUrl), ...(hasImages ? [IMAGE_HOST_PERMISSION] : [])];
  if (!await browser.permissions.contains({ origins })) return false;
  const permissions: DataPermissions & { origins?: string[] } = await browser.permissions.getAll();
  return permissions.data_collection === undefined
    || dataPermissions(hasToken).every((permission) => permissions.data_collection?.includes(permission));
}
