import { Button, Card, Typography } from "antd";
import { Image } from "antd/lib";

const { Title, Paragraph } = Typography;

interface TestimonialCardProps {
  name: string;
  image: string;
  content: string;
}

const TestimonialCard = ({ name, image, content }: TestimonialCardProps) => {
  return (
    <div
      className="px-3 h-full"
      style={{ minWidth: "520px", maxWidth: "520px" }}
    >
      <Card className="h-full flex flex-col rounded-2xl bg-white shadow-lg">
        <div className="flex flex-col h-full p-2 px-4 justify-between">
          <div className="flex-1 flex flex-col min-h-0">
            <div
              className="mb-4 text-6xl text-gray-300 h-12 flex items-start"
              aria-hidden
            >
              &ldquo;
            </div>
            <div className="flex-1 min-h-0">
              <p className="m-0 text-md md:text-lg leading-relaxed text-gray-700 h-full overflow-auto">
                {content}
              </p>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <Image
                height={120}
                src={`/teacher/${image}`}
                alt={name}
                preview={{
                  toolbarRender: () => null,
                }}
              />
              <div>
                <Title level={5} className="block text-xl text-gray-800">
                  {name}
                </Title>
              </div>
            </div>

            <button className="rounded-md lg:block hidden bg-primary px-6 py-2 text-white">
              Tìm hiểu thêm
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default TestimonialCard;
