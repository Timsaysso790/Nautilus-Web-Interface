from abc import ABC, abstractmethod
from typing import Any, Callable, Coroutine, List, Optional

ProgressCallback = Callable[[float, str], Coroutine[Any, Any, None]]


class DataSource(ABC):
    @property
    @abstractmethod
    def source_type(self) -> str:
        pass

    @abstractmethod
    async def validate_connection(self, api_key: str, **kwargs) -> bool:
        pass

    @abstractmethod
    async def list_symbols(self, query: str, **kwargs) -> List[str]:
        pass

    @abstractmethod
    async def download(
        self,
        config: dict,
        progress: ProgressCallback,
        **kwargs,
    ) -> str:
        pass
