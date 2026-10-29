import warnings
from contextlib import asynccontextmanager
from typing import AsyncIterator

from PIL import Image, ImageOps, UnidentifiedImageError
from starlette.datastructures import FormData, UploadFile
from starlette.exceptions import HTTPException
from starlette.formparsers import MultiPartException, MultiPartParser
from starlette.requests import Request

FILE_LIMIT = 10 * 1024 * 1024
BODY_LIMIT = 21 * 1024 * 1024
PIXEL_LIMIT = 20_000_000
Image.MAX_IMAGE_PIXELS = PIXEL_LIMIT


class CaptureMultipartParser(MultiPartParser):
    complete = False

    def on_end(self) -> None:
        super().on_end()
        self.complete = True


@asynccontextmanager
async def capture_form(request: Request, *, max_files: int = 2) -> AsyncIterator[FormData]:
    parser = CaptureMultipartParser(request.headers, request.stream(), max_files=max_files, max_fields=0, max_part_size=1024)
    form = None
    try:
        form = await parser.parse()
        if not parser.complete:
            raise MultiPartException("Incomplete multipart body.")
        yield form
    except MultiPartException:
        raise HTTPException(status_code=400, detail="Invalid capture multipart data.") from None
    finally:
        try:
            if form is not None:
                await form.close()
        finally:
            # Starlette 1.9 (uv.lock) retains every created spool here, including
            # unfinished parts absent from FormData. Recheck this bridge on upgrades.
            for file in parser._files_to_close_on_error:
                file.close()


class InvalidImage(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message


def decode_image(upload: UploadFile) -> Image.Image:
    file = upload.file
    file.seek(0, 2)
    if file.tell() > FILE_LIMIT:
        raise InvalidImage(413, "image_too_large", "Each image must be at most 10 MiB.")
    file.seek(0)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(file) as image:
                if image.format not in {"JPEG", "PNG", "WEBP"}:
                    raise InvalidImage(415, "unsupported_image", "Use JPEG, PNG or WebP images.")
                if image.width * image.height > PIXEL_LIMIT:
                    raise InvalidImage(413, "image_dimensions_too_large", "Images must contain at most 20 megapixels.")
                if getattr(image, "n_frames", 1) != 1:
                    raise InvalidImage(422, "animated_image", "Use a single still image for each view.")
                image.verify()
            file.seek(0)
            with Image.open(file) as image:
                image.load()
                oriented = ImageOps.exif_transpose(image)
                try:
                    return oriented.convert("RGB")
                finally:
                    oriented.close()
                    image.close()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise InvalidImage(413, "image_dimensions_too_large", "Images must contain at most 20 megapixels.") from None
    except UnidentifiedImageError:
        raise InvalidImage(415, "unsupported_image", "Use decodable JPEG, PNG or WebP images.") from None
    except (OSError, ValueError, SyntaxError):
        raise InvalidImage(422, "invalid_image", "An image could not be decoded.") from None
    finally:
        if not file.closed:
            file.seek(0)


def validate_image(upload: UploadFile) -> None:
    image = decode_image(upload)
    image.close()
