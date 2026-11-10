from yt_dlp.extractor.soundcloud import SoundcloudSearchIE as BaseSearch


class SoundcloudSearchIE(BaseSearch, plugin_name='yoump3_fast_search'):
    """Keep the API's artwork URL; never HEAD every cover during search."""
    def _extract_thumbnails(self, info):
        url = info.get('artwork_url') or (info.get('user') or {}).get('avatar_url')
        return [{'url': url}] if url else []
