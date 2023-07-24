"""Resource factory."""

from .resource import ResourceFactoryBase, ResourceType

from .sid import SidResource
from .sprite import SpriteMateResource, SpritePadResource
from .charset import CharPadResource
from .wave import WaveResource
from .bitmap import BitmapResource

class ResourceFactory(ResourceFactoryBase):
    """Resource factory."""

    def create_instance_from_file(self, filename: str):
        """Create resource instance."""

        resource_type = ResourceType.from_file(filename)
        resource = None

        if resource_type.equals("music.sid"):
            resource = SidResource(filename, resource_type)
        elif resource_type.equals("sprite.spritemate"):
            resource = SpriteMateResource(filename, resource_type)
        elif resource_type.equals("sprite.spritepad"):
            resource = SpritePadResource(filename, resource_type)
        elif resource_type.equals("charset.charpad"):
            resource = CharPadResource(filename, resource_type)
        elif resource_type.equals("bitmap.png") or resource_type.equals("bitmap.koala"):
            resource = BitmapResource(filename, resource_type)
        elif resource_type.equals("music.wave"):
            resource = WaveResource(filename, resource_type)
        else:
            resource = super().create_instance_from_file(filename)

        return resource
