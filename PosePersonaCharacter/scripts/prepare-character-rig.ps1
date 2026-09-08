param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputMasterPath,

  [Parameter(Mandatory = $true)]
  [string]$JointOutputDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;

public static class RigImageTools
{
    private static bool IsBackground(Color color)
    {
        int minimum = Math.Min(color.R, Math.Min(color.G, color.B));
        int maximum = Math.Max(color.R, Math.Max(color.G, color.B));
        return minimum >= 225 && maximum - minimum <= 18;
    }

    public static Bitmap RemoveConnectedLightBackground(Bitmap source)
    {
        int width = source.Width;
        int height = source.Height;
        bool[] visited = new bool[width * height];
        bool[] background = new bool[width * height];
        Queue<int> queue = new Queue<int>();

        Action<int, int> enqueue = (x, y) => {
            if (x < 0 || y < 0 || x >= width || y >= height) return;
            int index = y * width + x;
            if (visited[index]) return;
            visited[index] = true;
            if (!IsBackground(source.GetPixel(x, y))) return;
            background[index] = true;
            queue.Enqueue(index);
        };

        for (int x = 0; x < width; x++) {
            enqueue(x, 0);
            enqueue(x, height - 1);
        }
        for (int y = 0; y < height; y++) {
            enqueue(0, y);
            enqueue(width - 1, y);
        }

        while (queue.Count > 0) {
            int index = queue.Dequeue();
            int x = index % width;
            int y = index / width;
            enqueue(x - 1, y);
            enqueue(x + 1, y);
            enqueue(x, y - 1);
            enqueue(x, y + 1);
        }

        Bitmap output = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int index = y * width + x;
                Color color = source.GetPixel(x, y);
                output.SetPixel(x, y, background[index]
                    ? Color.Transparent
                    : Color.FromArgb(255, color.R, color.G, color.B));
            }
        }

        Bitmap edge = (Bitmap)output.Clone();
        for (int y = 1; y < height - 1; y++) {
            for (int x = 1; x < width - 1; x++) {
                Color color = output.GetPixel(x, y);
                if (color.A == 0) continue;
                bool touchesTransparency =
                    output.GetPixel(x - 1, y).A == 0 ||
                    output.GetPixel(x + 1, y).A == 0 ||
                    output.GetPixel(x, y - 1).A == 0 ||
                    output.GetPixel(x, y + 1).A == 0;
                if (!touchesTransparency) continue;

                int minimum = Math.Min(color.R, Math.Min(color.G, color.B));
                int maximum = Math.Max(color.R, Math.Max(color.G, color.B));
                double average = (color.R + color.G + color.B) / 3.0;
                if (maximum - minimum <= 22 && average > 165) {
                    int alpha = (int)Math.Round(Math.Max(18, Math.Min(255, (238 - average) * 3.2)));
                    edge.SetPixel(x, y, Color.FromArgb(alpha, color.R, color.G, color.B));
                }
            }
        }

        output.Dispose();
        return edge;
    }
}
'@

function Export-JointSprite {
  param(
    [System.Drawing.Bitmap]$Master,
    [string]$Name,
    [int]$CenterX,
    [int]$CenterY,
    [int]$RadiusX,
    [int]$RadiusY
  )

  $padding = 4
  $width = ($RadiusX + $padding) * 2
  $height = ($RadiusY + $padding) * 2
  $sprite = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($sprite)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddEllipse($padding, $padding, $RadiusX * 2, $RadiusY * 2)
  $graphics.SetClip($path)
  $source = [System.Drawing.Rectangle]::new($CenterX - $RadiusX - $padding, $CenterY - $RadiusY - $padding, $width, $height)
  $destination = [System.Drawing.Rectangle]::new(0, 0, $width, $height)
  $graphics.DrawImage($Master, $destination, $source, [System.Drawing.GraphicsUnit]::Pixel)

  $jointPath = Join-Path $JointOutputDirectory "$Name.png"
  $sprite.Save($jointPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $path.Dispose()
  $graphics.Dispose()
  $sprite.Dispose()
}

$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$masterDirectory = Split-Path -Parent $OutputMasterPath
New-Item -ItemType Directory -Path $masterDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $JointOutputDirectory -Force | Out-Null

$source = [System.Drawing.Bitmap]::FromFile($resolvedInput)
try {
  $master = [RigImageTools]::RemoveConnectedLightBackground($source)
  try {
    $master.Save($OutputMasterPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $joints = @(
      @{ Name = "neckJoint";          X = 512; Y = 242;  Rx = 54; Ry = 48 },
      @{ Name = "leftShoulderJoint";  X = 343; Y = 334;  Rx = 61; Ry = 61 },
      @{ Name = "rightShoulderJoint"; X = 690; Y = 334;  Rx = 61; Ry = 61 },
      @{ Name = "leftElbowJoint";     X = 235; Y = 500;  Rx = 58; Ry = 58 },
      @{ Name = "rightElbowJoint";    X = 789; Y = 500;  Rx = 58; Ry = 58 },
      @{ Name = "leftWristJoint";     X = 130; Y = 687;  Rx = 44; Ry = 44 },
      @{ Name = "rightWristJoint";    X = 894; Y = 687;  Rx = 44; Ry = 44 },
      @{ Name = "leftHipJoint";       X = 418; Y = 728;  Rx = 52; Ry = 52 },
      @{ Name = "rightHipJoint";      X = 606; Y = 728;  Rx = 52; Ry = 52 },
      @{ Name = "leftKneeJoint";      X = 377; Y = 1022; Rx = 61; Ry = 61 },
      @{ Name = "rightKneeJoint";     X = 647; Y = 1022; Rx = 61; Ry = 61 },
      @{ Name = "leftAnkleJoint";     X = 334; Y = 1344; Rx = 47; Ry = 47 },
      @{ Name = "rightAnkleJoint";    X = 690; Y = 1344; Rx = 47; Ry = 47 }
    )

    foreach ($joint in $joints) {
      Export-JointSprite -Master $master -Name $joint.Name -CenterX $joint.X -CenterY $joint.Y -RadiusX $joint.Rx -RadiusY $joint.Ry
    }
  } finally {
    $master.Dispose()
  }
} finally {
  $source.Dispose()
}

Write-Host "Prepared transparent master: $OutputMasterPath"
Write-Host "Prepared joint sprites: $JointOutputDirectory"
