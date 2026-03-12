import { apiFetch, apiFetchBlob } from '../../lib/api'

import type {
  MetadataDeployResponse,
  MetadataPreviewResponse,
  MetadataSectionName,
} from './metadata-admin-types'

function extractFilename(headers: Headers): string {
  const disposition = headers.get('content-disposition') ?? ''
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1])
  }

  const match = disposition.match(/filename="([^"]+)"/i)
  if (match?.[1]) {
    return match[1]
  }

  return 'admin-metadata.zip'
}

export async function exportMetadataPackage(
  sections: MetadataSectionName[],
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiFetchBlob('/metadata/admin/export', {
    method: 'POST',
    body: {
      sections,
    },
  })

  return {
    blob: response.blob,
    filename: extractFilename(response.headers),
  }
}

export function previewMetadataPackage(file: File): Promise<MetadataPreviewResponse> {
  const formData = new FormData()
  formData.append('package', file)

  return apiFetch<MetadataPreviewResponse>('/metadata/admin/preview', {
    method: 'POST',
    body: formData,
  })
}

export function deployMetadataPackage(
  file: File,
  packageHash: string,
  targetFingerprint: string,
): Promise<MetadataDeployResponse> {
  const formData = new FormData()
  formData.append('package', file)
  formData.append('packageHash', packageHash)
  formData.append('targetFingerprint', targetFingerprint)

  return apiFetch<MetadataDeployResponse>('/metadata/admin/deploy', {
    method: 'POST',
    body: formData,
  })
}
