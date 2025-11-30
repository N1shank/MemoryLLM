from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # API
    API_V1_PREFIX: str = "/api/v1"
    PROJECT_NAME: str = "MemoryLLM"
    DEBUG: bool = False

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # Gemini
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"

    # Notion MCP
    NOTION_API_KEY: str = ""
    NOTION_MCP_SERVER_PATH: str = "npx"
    NOTION_MCP_SERVER_ARGS: list[str] = ["-y", "@notionhq/notion-mcp-server"]


settings = Settings()

